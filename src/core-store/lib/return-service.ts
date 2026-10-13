import { updateOrderStatus } from './order-service';
import {
  bumpOrderRefundedCents,
  errorMessage,
  refundAtGateway,
} from './refund-service';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { storeOrderItems, storeOrders } from '@/core-store/schema/orders';
import {
  storeProductVariants,
  storeProducts,
} from '@/core-store/schema/products';
import { storeReturnItems, storeReturns } from '@/core-store/schema/returns';
import { getAffectedRows } from '@/core/crud/drizzle-utils';
import { logAudit } from '@/core/lib/infra/audit';
import { createLogger, markLogged } from '@/core/lib/infra/logger';
import { db } from '@/server/db';

const logger = createLogger('store-returns');

type ReturnStatus = (typeof storeReturns.$inferSelect)['status'];

/**
 * Statuses whose `refundAmountCents` is promised but not yet in
 * `store_orders.refundedCents`. `refunding` is included because the claim is
 * taken before the order counter moves — dropping it would let a second
 * return be approved against money already leaving the gateway.
 */
const PENDING_REFUND_STATUSES: ReturnStatus[] = [
  'approved',
  'received',
  'refunding',
];

/** Statuses from which a refund may be claimed (goods received or not). */
const REFUNDABLE_STATUSES: ReturnStatus[] = ['approved', 'received'];

// ─── Create Return ────────────────────────────────────────────────────────

export async function createReturn(params: {
  orderId: string;
  organizationId: string;
  requestedByUserId: string;
  items: Array<{
    orderItemId: string;
    quantity: number;
    reason?: string;
    condition: 'unopened' | 'damaged' | 'defective' | 'wrong_item' | 'other';
  }>;
}): Promise<string> {
  const { orderId, organizationId, requestedByUserId, items } = params;

  // Validate order exists and is in a returnable state
  const [order] = await db
    .select({ id: storeOrders.id, status: storeOrders.status })
    .from(storeOrders)
    .where(eq(storeOrders.id, orderId))
    .limit(1);

  if (!order) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
  }

  const returnableStatuses = ['delivered', 'processing', 'shipped'];
  if (!returnableStatuses.includes(order.status)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Cannot create return for order in "${order.status}" status`,
    });
  }

  // Validate quantities against already returned
  const alreadyReturned = await getAlreadyReturnedQuantities(orderId);

  const orderItems = await db
    .select({ id: storeOrderItems.id, quantity: storeOrderItems.quantity })
    .from(storeOrderItems)
    .where(eq(storeOrderItems.orderId, orderId))
    .limit(200);

  const orderItemMap = new Map(orderItems.map((oi) => [oi.id, oi.quantity]));

  for (const item of items) {
    const ordered = orderItemMap.get(item.orderItemId);
    if (ordered === undefined) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Order item ${item.orderItemId} not found in this order`,
      });
    }
    const returned = alreadyReturned.get(item.orderItemId) ?? 0;
    const available = ordered - returned;
    if (item.quantity > available) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Requested return quantity (${item.quantity}) exceeds returnable quantity (${available}) for order item ${item.orderItemId}`,
      });
    }
  }

  // Insert return
  const returnId = crypto.randomUUID();
  await db.insert(storeReturns).values({
    id: returnId,
    orderId,
    organizationId,
    requestedByUserId,
    status: 'requested',
  });

  // Insert return items
  for (const item of items) {
    await db.insert(storeReturnItems).values({
      returnId,
      orderItemId: item.orderItemId,
      quantity: item.quantity,
      reason: item.reason ?? null,
      condition: item.condition,
    });
  }

  await updateOrderStatus(
    orderId,
    'return_requested',
    requestedByUserId,
    'Return requested'
  );

  logger.info('Return created', { returnId, orderId, itemCount: items.length });

  return returnId;
}

// ─── Approve Return ───────────────────────────────────────────────────────

export async function approveReturn(
  returnId: string,
  refundAmountCents?: number
): Promise<void> {
  const [ret] = await db
    .select({
      id: storeReturns.id,
      orderId: storeReturns.orderId,
      status: storeReturns.status,
    })
    .from(storeReturns)
    .where(eq(storeReturns.id, returnId))
    .limit(1);

  if (!ret) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Return not found' });
  }

  // Re-approving an `approved` return is allowed so an admin can correct the
  // amount; anything past that point already has money in motion.
  const approvableFrom: ReturnStatus[] = ['requested', 'approved'];
  if (!approvableFrom.includes(ret.status)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Cannot approve return in "${ret.status}" status`,
    });
  }

  if (
    refundAmountCents !== undefined &&
    (!Number.isInteger(refundAmountCents) || refundAmountCents < 0)
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Refund amount must be a non-negative integer number of cents',
    });
  }

  // Calculate refund from return item prices if not provided
  let amountCents = refundAmountCents;
  if (amountCents === undefined) {
    const returnItems = await db
      .select({
        quantity: storeReturnItems.quantity,
        unitPriceCents: storeOrderItems.unitPriceCents,
      })
      .from(storeReturnItems)
      .innerJoin(
        storeOrderItems,
        eq(storeOrderItems.id, storeReturnItems.orderItemId)
      )
      .where(eq(storeReturnItems.returnId, returnId))
      .limit(200);

    amountCents = returnItems.reduce(
      (sum, item) => sum + item.unitPriceCents * item.quantity,
      0
    );
  }

  const remainingCents = await getRemainingRefundableCents(
    ret.orderId,
    returnId
  );
  if (amountCents > remainingCents) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Refund amount (${amountCents} cents) exceeds the order's remaining refundable amount (${remainingCents} cents) once other pending returns are counted`,
    });
  }

  // CAS on status: a concurrent reject/refund between our read and this write
  // must not be silently overwritten back to `approved`.
  const result = await db
    .update(storeReturns)
    .set({
      status: 'approved',
      refundAmountCents: amountCents,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(storeReturns.id, returnId),
        inArray(storeReturns.status, approvableFrom)
      )
    );

  if (getAffectedRows(result) === 0) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Return status changed concurrently — refresh and retry',
    });
  }

  logger.info('Return approved', {
    returnId,
    refundAmountCents: amountCents,
    remainingCents,
  });
}

/**
 * How much of the order can still be refunded: paid total minus what has
 * already gone back minus what other returns on the order have been promised.
 * This is a soft gate (read-then-check) — the hard, race-safe stop is the
 * guarded `refundedCents` UPDATE in `processReturnRefund`.
 */
async function getRemainingRefundableCents(
  orderId: string,
  excludeReturnId: string
): Promise<number> {
  const [order] = await db
    .select({
      totalCents: storeOrders.totalCents,
      refundedCents: storeOrders.refundedCents,
    })
    .from(storeOrders)
    .where(eq(storeOrders.id, orderId))
    .limit(1);

  if (!order) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
  }

  // SUM over integer comes back as bigint (a string in JS) — cast in SQL and coerce.
  const [pending] = await db
    .select({
      totalCents: sql<
        number | string
      >`COALESCE(SUM(${storeReturns.refundAmountCents}), 0)::int`,
    })
    .from(storeReturns)
    .where(
      and(
        eq(storeReturns.orderId, orderId),
        inArray(storeReturns.status, PENDING_REFUND_STATUSES),
        ne(storeReturns.id, excludeReturnId)
      )
    )
    .limit(1);

  const pendingCents = Number(pending?.totalCents ?? 0);
  return order.totalCents - order.refundedCents - pendingCents;
}

// ─── Receive Return ───────────────────────────────────────────────────────

export async function receiveReturn(
  returnId: string,
  restockItems = true
): Promise<void> {
  const [ret] = await db
    .select({ id: storeReturns.id, orderId: storeReturns.orderId })
    .from(storeReturns)
    .where(eq(storeReturns.id, returnId))
    .limit(1);

  if (!ret) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Return not found' });
  }

  // CAS: receiving must never clobber `refunding`/`refunded` (that would re-open
  // the refund claim and allow a second payout), and it must run once so the
  // restock below cannot double-count.
  const result = await db
    .update(storeReturns)
    .set({ status: 'received', updatedAt: new Date() })
    .where(
      and(
        eq(storeReturns.id, returnId),
        inArray(storeReturns.status, ['requested', 'approved'])
      )
    );

  if (getAffectedRows(result) === 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Return cannot be received — it is already received, refunded, in refund, or rejected',
    });
  }

  // Restock items if requested
  if (restockItems) {
    const returnItems = await db
      .select({
        quantity: storeReturnItems.quantity,
        condition: storeReturnItems.condition,
        productId: storeOrderItems.productId,
        variantId: storeOrderItems.variantId,
      })
      .from(storeReturnItems)
      .innerJoin(
        storeOrderItems,
        eq(storeOrderItems.id, storeReturnItems.orderItemId)
      )
      .where(eq(storeReturnItems.returnId, returnId))
      .limit(200);

    for (const item of returnItems) {
      // Only restock unopened items by default
      if (item.condition !== 'unopened') continue;

      if (item.variantId) {
        await db
          .update(storeProductVariants)
          .set({
            stockQuantity: sql`${storeProductVariants.stockQuantity} + ${item.quantity}`,
          })
          .where(eq(storeProductVariants.id, item.variantId));
      } else if (item.productId) {
        await db
          .update(storeProducts)
          .set({
            stockQuantity: sql`${storeProducts.stockQuantity} + ${item.quantity}`,
          })
          .where(eq(storeProducts.id, item.productId));
      }
    }

    logger.info('Return items restocked', { returnId });
  }

  logger.info('Return received', { returnId });
}

// ─── Process Return Refund ────────────────────────────────────────────────

/**
 * Refund an approved return. Order of operations is the whole point:
 *
 *   1. claim the return (`approved|received` → `refunding`, atomic CAS)
 *   2. call the gateway
 *   3. commit: return → `refunded` + `order.refundedCents += amount`, guarded
 *      by `refundedCents + amount <= totalCents`, in one transaction
 *
 * Two admin clicks or a retried timeout therefore reach the gateway once: the
 * loser of the CAS gets CONFLICT before any money moves. A gateway *throw*
 * leaves the claim in place — the outcome is unknown and an automatic retry
 * could pay twice — so ops must verify at the provider and resolve by hand.
 * A definitive decline (`status: 'failed'`) releases the claim for retry.
 */
export async function processReturnRefund(
  returnId: string
): Promise<{ refundId?: string }> {
  const [ret] = await db
    .select({
      id: storeReturns.id,
      orderId: storeReturns.orderId,
      status: storeReturns.status,
      refundAmountCents: storeReturns.refundAmountCents,
    })
    .from(storeReturns)
    .where(eq(storeReturns.id, returnId))
    .limit(1);

  if (!ret) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Return not found' });
  }

  if (ret.status === 'refunded') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Return has already been refunded',
    });
  }
  if (ret.status === 'refunding') {
    throw new TRPCError({
      code: 'CONFLICT',
      message:
        'A refund for this return is in progress or ended with an unknown outcome — verify at the payment provider before retrying',
    });
  }
  if (!REFUNDABLE_STATUSES.includes(ret.status)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Cannot refund return in "${ret.status}" status — approve first`,
    });
  }

  const amountCents = ret.refundAmountCents;
  if (!amountCents || amountCents <= 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Return has no refund amount set — approve first',
    });
  }

  const [order] = await db
    .select({
      paymentTransactionId: storeOrders.paymentTransactionId,
      currency: storeOrders.currency,
      totalCents: storeOrders.totalCents,
      refundedCents: storeOrders.refundedCents,
    })
    .from(storeOrders)
    .where(eq(storeOrders.id, ret.orderId))
    .limit(1);

  if (!order) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
  }

  // Cheap pre-check so an over-refund is refused before anything is claimed;
  // the transactional guard below is what actually makes it race-safe.
  if (order.refundedCents + amountCents > order.totalCents) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Refund (${amountCents} cents) would exceed the order total: ${order.refundedCents} of ${order.totalCents} cents already refunded`,
    });
  }

  const claim = await db
    .update(storeReturns)
    .set({ status: 'refunding', updatedAt: new Date() })
    .where(
      and(
        eq(storeReturns.id, returnId),
        inArray(storeReturns.status, REFUNDABLE_STATUSES)
      )
    );

  if (getAffectedRows(claim) === 0) {
    throw new TRPCError({
      code: 'CONFLICT',
      message:
        'Refund already claimed by another request — refresh to see the result',
    });
  }

  const refundId = await callRefundGateway({
    returnId,
    orderId: ret.orderId,
    priorStatus: ret.status,
    transactionId: order.paymentTransactionId,
    amountCents,
    currency: order.currency,
  });

  const newRefundedCents = await commitReturnRefund({
    returnId,
    orderId: ret.orderId,
    amountCents,
    refundId,
  });

  await updateOrderStatus(
    ret.orderId,
    newRefundedCents >= order.totalCents ? 'refunded' : 'partially_refunded',
    'system',
    `Return refund processed (${amountCents} cents, ${newRefundedCents}/${order.totalCents} refunded)`
  );

  logger.info('Return refund processed', {
    returnId,
    refundId,
    amountCents,
    refundedCents: newRefundedCents,
  });

  return { refundId };
}

/**
 * Step 2 of `processReturnRefund`. Resolves to the gateway refund id (or
 * undefined when no handler/transaction is configured — then the refund is
 * bookkeeping only). Throws TRPCError; the claim handling differs per outcome.
 */
async function callRefundGateway(params: {
  returnId: string;
  orderId: string;
  priorStatus: ReturnStatus;
  transactionId: string | null;
  amountCents: number;
  currency: string;
}): Promise<string | undefined> {
  const {
    returnId,
    orderId,
    priorStatus,
    transactionId,
    amountCents,
    currency,
  } = params;

  const result = await refundAtGateway({
    orderId,
    transactionId,
    amountCents,
    currency,
    reason: 'return',
  });

  if (result.outcome === 'unknown') {
    // Outcome unknown: the money may or may not have moved. Keeping the claim
    // (`refunding`) is the safe direction — it blocks a duplicate payout at the
    // cost of a human check; releasing it would invite exactly the retry that
    // pays twice. `resolveStuckRefund` is the ops exit.
    logger.error(
      'Refund gateway call threw — outcome unknown, return left in "refunding" for manual verification',
      {
        returnId,
        orderId,
        transactionId,
        amountCents,
        currency,
        error: errorMessage(result.error),
      }
    );
    throw markLogged(
      new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Refund of ${amountCents} cents could not be confirmed — verify at the payment provider before retrying`,
        cause: result.error,
      })
    );
  }

  if (result.outcome === 'failed') {
    // Definitive decline: nothing moved, so hand the return back to its prior
    // state. CAS on `refunding` so we never overwrite a state someone else set.
    const rollback = await db
      .update(storeReturns)
      .set({ status: priorStatus, updatedAt: new Date() })
      .where(
        and(eq(storeReturns.id, returnId), eq(storeReturns.status, 'refunding'))
      );
    if (getAffectedRows(rollback) === 0) {
      logger.error(
        'Refund declined but claim rollback matched 0 rows — return status changed concurrently',
        { returnId, orderId }
      );
    }
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `Payment provider declined the refund${result.failureReason ? `: ${result.failureReason}` : ''}`,
    });
  }

  return result.refundId;
}

/**
 * Step 3 of `processReturnRefund`: one transaction flips the return to
 * `refunded` and bumps the order's cumulative counter. Returns the new
 * `refundedCents`. The `<= totalCents` guard is the race-safe cap across
 * returns; if it ever trips here the gateway has already paid, so the claim
 * stays (`refunding`) and the error carries everything ops needs.
 */
async function commitReturnRefund(params: {
  returnId: string;
  orderId: string;
  amountCents: number;
  refundId: string | undefined;
}): Promise<number> {
  const { returnId, orderId, amountCents, refundId } = params;

  return db.transaction(async (tx) => {
    const newRefundedCents = await bumpOrderRefundedCents(
      tx,
      orderId,
      amountCents
    );

    if (newRefundedCents === null) {
      logger.error(
        'Gateway refund succeeded but order cap guard rejected the commit — return left in "refunding", reconcile manually',
        {
          returnId,
          orderId,
          amountCents,
          refundId,
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

    const flipped = await tx
      .update(storeReturns)
      .set({
        status: 'refunded',
        refundedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(storeReturns.id, returnId), eq(storeReturns.status, 'refunding'))
      );

    if (getAffectedRows(flipped) === 0) {
      // Rolls back the counter bump too (transaction) — the claim we held was
      // taken from under us, which should be impossible; loud is correct.
      logger.error(
        'Return left "refunding" state during gateway call — refusing to commit',
        { returnId, orderId, refundId }
      );
      throw markLogged(
        new TRPCError({
          code: 'CONFLICT',
          message:
            'Return state changed during refund — manual reconciliation required',
        })
      );
    }

    return newRefundedCents;
  });
}

// ─── Resolve Stuck Refund (ops) ───────────────────────────────────────────

/**
 * Ops exit for a return left in `refunding` after an unknown gateway outcome.
 * The admin checks the provider dashboard first, then either confirms the
 * money moved (`refunded` → commits exactly like a normal success) or that it
 * did not (`release` → back to `approved`, refundable again). Both are CAS'd
 * on `refunding` so a concurrent resolution cannot apply twice, and both are
 * audit-logged because they move money state on a human's say-so.
 */
export async function resolveStuckRefund(params: {
  returnId: string;
  outcome: 'refunded' | 'release';
  actorUserId: string;
  providerRefundId?: string;
}): Promise<void> {
  const { returnId, outcome, actorUserId, providerRefundId } = params;

  const [ret] = await db
    .select({
      id: storeReturns.id,
      orderId: storeReturns.orderId,
      status: storeReturns.status,
      refundAmountCents: storeReturns.refundAmountCents,
    })
    .from(storeReturns)
    .where(eq(storeReturns.id, returnId))
    .limit(1);

  if (!ret) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Return not found' });
  }
  if (ret.status !== 'refunding') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Return is "${ret.status}", not stuck in "refunding" — nothing to resolve`,
    });
  }

  if (outcome === 'release') {
    const released = await db
      .update(storeReturns)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(
        and(eq(storeReturns.id, returnId), eq(storeReturns.status, 'refunding'))
      );
    if (getAffectedRows(released) === 0) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Return was resolved concurrently — refresh',
      });
    }
  } else {
    const amountCents = ret.refundAmountCents ?? 0;
    if (amountCents <= 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Return has no refund amount — release it instead',
      });
    }

    const [order] = await db
      .select({ totalCents: storeOrders.totalCents })
      .from(storeOrders)
      .where(eq(storeOrders.id, ret.orderId))
      .limit(1);
    if (!order) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
    }

    const newRefundedCents = await commitReturnRefund({
      returnId,
      orderId: ret.orderId,
      amountCents,
      refundId: providerRefundId,
    });
    await updateOrderStatus(
      ret.orderId,
      newRefundedCents >= order.totalCents ? 'refunded' : 'partially_refunded',
      actorUserId,
      `Stuck return refund confirmed by admin (${amountCents} cents, ${newRefundedCents}/${order.totalCents} refunded)`
    );
  }

  logAudit({
    db,
    userId: actorUserId,
    action: `store.return.refund_${outcome === 'release' ? 'released' : 'confirmed'}`,
    entityType: 'store_return',
    entityId: returnId,
    metadata: {
      orderId: ret.orderId,
      refundAmountCents: ret.refundAmountCents,
      providerRefundId: providerRefundId ?? null,
    },
  });

  logger.info('Stuck return refund resolved', {
    returnId,
    outcome,
    actorUserId,
    providerRefundId,
  });
}

// ─── Reject Return ────────────────────────────────────────────────────────

export async function rejectReturn(
  returnId: string,
  adminNote: string
): Promise<void> {
  const [ret] = await db
    .select({ id: storeReturns.id })
    .from(storeReturns)
    .where(eq(storeReturns.id, returnId))
    .limit(1);

  if (!ret) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Return not found' });
  }

  // Money that has moved (or may be moving) cannot be rejected away.
  const result = await db
    .update(storeReturns)
    .set({ status: 'rejected', adminNote, updatedAt: new Date() })
    .where(
      and(
        eq(storeReturns.id, returnId),
        inArray(storeReturns.status, ['requested', 'approved', 'received'])
      )
    );

  if (getAffectedRows(result) === 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Return cannot be rejected — refund already in progress or completed',
    });
  }

  logger.info('Return rejected', { returnId });
}

// ─── Get Order Returns ────────────────────────────────────────────────────

export async function getOrderReturns(orderId: string) {
  const returns = await db
    .select()
    .from(storeReturns)
    .where(eq(storeReturns.orderId, orderId))
    .orderBy(storeReturns.createdAt)
    .limit(50);

  const result = [];

  for (const ret of returns) {
    const items = await db
      .select({
        id: storeReturnItems.id,
        orderItemId: storeReturnItems.orderItemId,
        quantity: storeReturnItems.quantity,
        reason: storeReturnItems.reason,
        condition: storeReturnItems.condition,
        productName: storeOrderItems.productName,
        variantName: storeOrderItems.variantName,
      })
      .from(storeReturnItems)
      .innerJoin(
        storeOrderItems,
        eq(storeOrderItems.id, storeReturnItems.orderItemId)
      )
      .where(eq(storeReturnItems.returnId, ret.id))
      .limit(100);

    result.push({ ...ret, items });
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Sum returned quantities per orderItemId (excluding rejected returns).
 */
export async function getAlreadyReturnedQuantities(
  orderId: string
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      orderItemId: storeReturnItems.orderItemId,
      totalQty: sql<number>`COALESCE(SUM(${storeReturnItems.quantity}), 0)`,
    })
    .from(storeReturnItems)
    .innerJoin(storeReturns, eq(storeReturns.id, storeReturnItems.returnId))
    .where(
      and(
        eq(storeReturns.orderId, orderId),
        ne(storeReturns.status, 'rejected')
      )
    )
    .groupBy(storeReturnItems.orderItemId)
    .limit(200);

  return new Map(rows.map((r) => [r.orderItemId, r.totalQty]));
}
