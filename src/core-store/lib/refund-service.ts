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
import { type SQL, and, eq, inArray, sql } from 'drizzle-orm';

import { storeOrders } from '@/core-store/schema/orders';
import { getAffectedRows } from '@/core/crud/drizzle-utils';
import { logAudit } from '@/core/lib/infra/audit';
import { createLogger, markLogged } from '@/core/lib/infra/logger';
import { type DbClient, db } from '@/server/db';

const logger = createLogger('store-refunds');

type OrderStatus = (typeof storeOrders.$inferSelect)['status'];

/**
 * Paid states a whole-order refund may be claimed from — and therefore the
 * only states a stuck claim may be released back to.
 */
export const ORDER_REFUNDABLE_STATUSES = [
  'processing',
  'shipped',
  'delivered',
  'partially_refunded',
] as const satisfies readonly OrderStatus[];

export type RefundableOrderStatus = (typeof ORDER_REFUNDABLE_STATUSES)[number];

function isRefundableStatus(
  status: OrderStatus
): status is RefundableOrderStatus {
  return (ORDER_REFUNDABLE_STATUSES as readonly OrderStatus[]).includes(status);
}

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
 * past `totalCents`. Returns the new cumulative value. Extra `guards` join the
 * WHERE so a caller can make the bump a CAS on the claim it holds.
 */
export async function bumpOrderRefundedCents(
  tx: DbClient,
  orderId: string,
  amountCents: number,
  guards: SQL[] = []
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
        sql`${storeOrders.refundedCents} + ${amountCents} <= ${storeOrders.totalCents}`,
        ...guards
      )
    )
    .returning({ refundedCents: storeOrders.refundedCents });

  return updated?.refundedCents ?? null;
}

// ─── Whole-order refund (admin) ───────────────────────────────────────────

/**
 * Final step shared by the live refund and the ops confirmation
 * (`resolveStuckOrderRefund`): bump the ledger, then re-set `refunded` through
 * `updateOrderStatus` — idempotent on the status (the claim already set it)
 * but it emits the event log entry, webhook and customer notification.
 * Returns the new cumulative counter, or null when the guarded bump matched no
 * row (cap tripped or a `guards` CAS lost) — nothing is emitted then and the
 * caller decides what that means for the claim it holds.
 */
async function commitWholeOrderRefund(params: {
  orderId: string;
  amountCents: number;
  actor: string;
  note: string;
  refundId?: string;
  guards?: SQL[];
}): Promise<number | null> {
  const { orderId, amountCents, actor, note, refundId, guards } = params;

  const newRefundedCents = await bumpOrderRefundedCents(
    db,
    orderId,
    amountCents,
    guards
  );
  if (newRefundedCents === null) return null;

  await updateOrderStatus(orderId, 'refunded', actor, note);

  logger.info('Order refunded in full', {
    orderId,
    amountCents,
    refundId,
    refundedCents: newRefundedCents,
  });

  return newRefundedCents;
}

/**
 * Refunds whatever is still outstanding on an order (`totalCents −
 * refundedCents`). The order has no dedicated claim status, so the claim *is*
 * the status flip to `refunded`, CAS'd on the current paid status and the
 * prior `refundedCents`. On a gateway throw the order stays `refunded` with
 * the counter not yet bumped — the safe direction (no second payout is
 * possible from `refunded`) — and the error log tells ops to verify at the
 * provider and settle via `resolveStuckOrderRefund`.
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

  if (!isRefundableStatus(order.status)) {
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
        inArray(storeOrders.status, [...ORDER_REFUNDABLE_STATUSES]),
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
      'Order refund gateway call threw — outcome unknown; order left "refunded" with refundedCents not updated, verify at provider then resolveStuckRefund',
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

  const newRefundedCents = await commitWholeOrderRefund({
    orderId,
    amountCents,
    actor,
    note: reason ?? 'Refund issued by admin',
    refundId: gateway.refundId,
  });
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

  return { refundId: gateway.refundId, amountCents };
}

// ─── Resolve stuck whole-order refund (ops) ───────────────────────────────

/**
 * The status an order was in before `refundWholeOrder` claimed it. The claim
 * overwrites the status in place, so this is reconstructed from the ledger and
 * fulfilment timestamps; the operator can override it when they know better.
 */
function inferPreClaimStatus(order: {
  refundedCents: number;
  shippedAt: Date | null;
  deliveredAt: Date | null;
}): RefundableOrderStatus {
  if (order.refundedCents > 0) return 'partially_refunded';
  if (order.deliveredAt) return 'delivered';
  if (order.shippedAt) return 'shipped';
  return 'processing';
}

/**
 * Ops exit for an order left holding a whole-order refund claim (`status =
 * refunded` while `refundedCents < totalCents`) after an unknown gateway
 * outcome. The admin checks the provider dashboard first, then either confirms
 * the money moved (`refunded` → commits exactly like a normal success) or that
 * it did not (`release` → back to the pre-claim paid status, refundable
 * again). Both are CAS'd on the claim (`refunded` + the counter as read) so a
 * concurrent resolution cannot apply twice, and both are audit-logged because
 * they move money state on a human's say-so. The ledger changes only on
 * `refunded`.
 */
export async function resolveStuckOrderRefund(params: {
  orderId: string;
  outcome: 'refunded' | 'release';
  actorUserId: string;
  providerRefundId?: string;
  note?: string;
  /** `release` only: where to put the order back; inferred when omitted. */
  restoreStatus?: RefundableOrderStatus;
}): Promise<{ refundedCents: number; status: OrderStatus }> {
  const { orderId, outcome, actorUserId, providerRefundId, note } = params;

  const [order] = await db
    .select({
      status: storeOrders.status,
      totalCents: storeOrders.totalCents,
      refundedCents: storeOrders.refundedCents,
      shippedAt: storeOrders.shippedAt,
      deliveredAt: storeOrders.deliveredAt,
    })
    .from(storeOrders)
    .where(eq(storeOrders.id, orderId))
    .limit(1);

  if (!order) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
  }
  if (order.status !== 'refunded') {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Order is "${order.status}", not holding a refund claim — nothing to resolve`,
    });
  }
  const amountCents = order.totalCents - order.refundedCents;
  if (amountCents <= 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Order refund is already settled in full — nothing to resolve',
    });
  }

  const claimHeld = [
    eq(storeOrders.status, 'refunded'),
    eq(storeOrders.refundedCents, order.refundedCents),
  ];

  let finalStatus: OrderStatus;
  let refundedCents = order.refundedCents;

  if (outcome === 'release') {
    finalStatus = params.restoreStatus ?? inferPreClaimStatus(order);
    const released = await db
      .update(storeOrders)
      .set({ status: finalStatus, refundedAt: null, updatedAt: new Date() })
      .where(and(eq(storeOrders.id, orderId), ...claimHeld));
    if (getAffectedRows(released) === 0) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Order refund was resolved concurrently — refresh',
      });
    }
  } else {
    finalStatus = 'refunded';
    const committed = await commitWholeOrderRefund({
      orderId,
      amountCents,
      actor: actorUserId,
      note:
        note ??
        `Stuck refund confirmed by admin at the payment provider (${amountCents} cents)`,
      refundId: providerRefundId,
      guards: claimHeld,
    });
    if (committed === null) {
      throw new TRPCError({
        code: 'CONFLICT',
        message:
          'Order refund was resolved concurrently — refresh and re-check at the provider',
      });
    }
    refundedCents = committed;
  }

  logAudit({
    db,
    userId: actorUserId,
    action: `store.order.refund_${outcome === 'release' ? 'released' : 'confirmed'}`,
    entityType: 'store_order',
    entityId: orderId,
    metadata: {
      amountCents,
      refundedCents,
      totalCents: order.totalCents,
      status: finalStatus,
      providerRefundId: providerRefundId ?? null,
      note: note ?? null,
    },
  });

  logger.info('Stuck order refund resolved', {
    orderId,
    outcome,
    actorUserId,
    status: finalStatus,
    providerRefundId,
  });

  return { refundedCents, status: finalStatus };
}
