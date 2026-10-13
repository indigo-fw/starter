/**
 * Shared refund ledger + gateway plumbing used by return refunds
 * (`return-service.ts`) and whole-order refunds (`refundWholeOrder` below).
 *
 * Every refund path follows claim → gateway → commit: a CAS claim is taken on
 * the DB row *before* the gateway is called, so a double click or a retried
 * timeout can only reach the gateway once. The claim is kept when the gateway
 * outcome is unknown (never auto-retried), released on a definitive decline,
 * and committed into `store_orders.refundedCents` under the
 * `refundedCents + amount <= totalCents` guard that caps every path together.
 */
import { updateOrderStatus } from './order-service';
import { type RefundResult, getRefundHandler } from './refund-types';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { storeOrders } from '@/core-store/schema/orders';
import { getAffectedRows } from '@/core/crud/drizzle-utils';
import { createLogger, markLogged } from '@/core/lib/infra/logger';
import { type DbClient, db } from '@/server/db';

const logger = createLogger('store-refunds');

type OrderStatus = (typeof storeOrders.$inferSelect)['status'];

/** Paid states a whole-order refund may be claimed from. */
const ORDER_REFUNDABLE_STATUSES: OrderStatus[] = [
  'processing',
  'shipped',
  'delivered',
  'partially_refunded',
];

// ─── Gateway ──────────────────────────────────────────────────────────────

export type GatewayRefundOutcome =
  /** Money moved (or no handler/transaction is configured → bookkeeping only). */
  | { outcome: 'succeeded'; refundId?: string }
  /** Provider said no; nothing moved. Safe to release the claim. */
  | { outcome: 'failed'; failureReason?: string }
  /** Handler threw: unknown whether money moved. Keep the claim, involve a human. */
  | { outcome: 'unknown'; error: unknown };

/**
 * Calls the registered `RefundHandler` and normalises its three possible
 * outcomes. Never throws — callers decide what each outcome means for the
 * claim they hold.
 */
export async function refundAtGateway(params: {
  orderId: string;
  transactionId: string | null;
  amountCents: number;
  currency: string;
  reason?: string;
}): Promise<GatewayRefundOutcome> {
  const handler = getRefundHandler();
  if (!handler || !params.transactionId) return { outcome: 'succeeded' };

  let result: RefundResult;
  try {
    result = await handler.refundPayment({
      ...params,
      transactionId: params.transactionId,
    });
  } catch (error) {
    return { outcome: 'unknown', error };
  }

  if (result.status === 'failed')
    return { outcome: 'failed', failureReason: result.failureReason };
  return { outcome: 'succeeded', refundId: result.refundId };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── Ledger ───────────────────────────────────────────────────────────────

/**
 * Adds `amountCents` to the order's refunded counter, refusing (null) when it
 * would exceed the paid total. Single guarded UPDATE so concurrent refunds on
 * the same order (two returns, a return + a whole-order refund) can never sum
 * past `totalCents`. Returns the new cumulative value.
 */
export async function bumpOrderRefundedCents(
  tx: DbClient,
  orderId: string,
  amountCents: number
): Promise<number | null> {
  const [updated] = await tx
    .update(storeOrders)
    .set({
      refundedCents: sql`${storeOrders.refundedCents} + ${amountCents}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(storeOrders.id, orderId),
        sql`${storeOrders.refundedCents} + ${amountCents} <= ${storeOrders.totalCents}`
      )
    )
    .returning({ refundedCents: storeOrders.refundedCents });

  return updated?.refundedCents ?? null;
}

// ─── Whole-order refund (admin) ───────────────────────────────────────────

/**
 * Refunds whatever is still outstanding on an order (`totalCents −
 * refundedCents`). The order has no dedicated claim status, so the claim *is*
 * the status flip to `refunded`, CAS'd on the current paid status and the
 * prior `refundedCents`. On a gateway throw the order stays `refunded` with
 * the counter not yet bumped — the safe direction (no second payout is
 * possible from `refunded`) — and the error log tells ops to verify at the
 * provider and fix the counter by hand.
 */
export async function refundWholeOrder(params: {
  orderId: string;
  actor: string;
  reason?: string;
}): Promise<{ refundId?: string; amountCents: number }> {
  const { orderId, actor, reason } = params;

  const [order] = await db
    .select({
      status: storeOrders.status,
      totalCents: storeOrders.totalCents,
      refundedCents: storeOrders.refundedCents,
      paymentTransactionId: storeOrders.paymentTransactionId,
      currency: storeOrders.currency,
    })
    .from(storeOrders)
    .where(eq(storeOrders.id, orderId))
    .limit(1);

  if (!order) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
  }

  if (!ORDER_REFUNDABLE_STATUSES.includes(order.status)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Cannot refund an order with status "${order.status}". Only processing, shipped, delivered, or partially refunded orders can be refunded.`,
    });
  }

  const amountCents = order.totalCents - order.refundedCents;
  if (amountCents <= 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Order has already been refunded in full',
    });
  }

  const claim = await db
    .update(storeOrders)
    .set({ status: 'refunded', refundedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(storeOrders.id, orderId),
        inArray(storeOrders.status, ORDER_REFUNDABLE_STATUSES),
        eq(storeOrders.refundedCents, order.refundedCents)
      )
    );

  if (getAffectedRows(claim) === 0) {
    throw new TRPCError({
      code: 'CONFLICT',
      message:
        'Refund already claimed by another request — refresh to see the result',
    });
  }

  const gateway = await refundAtGateway({
    orderId,
    transactionId: order.paymentTransactionId,
    amountCents,
    currency: order.currency,
    reason,
  });

  if (gateway.outcome === 'unknown') {
    logger.error(
      'Order refund gateway call threw — outcome unknown; order left "refunded" with refundedCents not updated, verify at provider',
      {
        orderId,
        transactionId: order.paymentTransactionId,
        amountCents,
        currency: order.currency,
        refundedCents: order.refundedCents,
        error: errorMessage(gateway.error),
      }
    );
    throw markLogged(
      new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Refund of ${amountCents} cents could not be confirmed — verify at the payment provider before retrying`,
        cause: gateway.error,
      })
    );
  }

  if (gateway.outcome === 'failed') {
    const rollback = await db
      .update(storeOrders)
      .set({ status: order.status, refundedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(storeOrders.id, orderId),
          eq(storeOrders.status, 'refunded'),
          eq(storeOrders.refundedCents, order.refundedCents)
        )
      );
    if (getAffectedRows(rollback) === 0) {
      logger.error(
        'Order refund declined but claim rollback matched 0 rows — order changed concurrently',
        { orderId }
      );
    }
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `Payment provider declined the refund${gateway.failureReason ? `: ${gateway.failureReason}` : ''}`,
    });
  }

  const newRefundedCents = await bumpOrderRefundedCents(
    db,
    orderId,
    amountCents
  );
  if (newRefundedCents === null) {
    // A return refund committed between our claim and this bump. The gateway
    // has paid, so the order stays `refunded`; the counter needs a human.
    logger.error(
      'Order refund paid but cap guard rejected the counter bump — reconcile refundedCents manually',
      {
        orderId,
        amountCents,
        refundId: gateway.refundId,
      }
    );
    throw markLogged(
      new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          'Refund was issued but exceeds the order total — manual reconciliation required',
      })
    );
  }

  // The claim already set the status; this re-set is idempotent and exists for
  // the event log + webhook + customer notification it emits.
  await updateOrderStatus(
    orderId,
    'refunded',
    actor,
    reason ?? 'Refund issued by admin'
  );

  logger.info('Order refunded in full', {
    orderId,
    amountCents,
    refundId: gateway.refundId,
    refundedCents: newRefundedCents,
  });

  return { refundId: gateway.refundId, amountCents };
}
