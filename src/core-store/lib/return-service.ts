import { eq, and, sql, ne } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { db } from '@/server/db';
import { storeReturns, storeReturnItems } from '@/core-store/schema/returns';
import { storeOrders, storeOrderItems } from '@/core-store/schema/orders';
import { storeProducts, storeProductVariants } from '@/core-store/schema/products';
import { updateOrderStatus } from './order-service';
import { getRefundHandler } from './refund-types';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-returns');

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
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Order item ${item.orderItemId} not found in this order` });
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

  await updateOrderStatus(orderId, 'return_requested', requestedByUserId, 'Return requested');

  logger.info('Return created', { returnId, orderId, itemCount: items.length });

  return returnId;
}

// ─── Approve Return ───────────────────────────────────────────────────────

export async function approveReturn(returnId: string, refundAmountCents?: number): Promise<void> {
  const [ret] = await db
    .select({ id: storeReturns.id, orderId: storeReturns.orderId, status: storeReturns.status })
    .from(storeReturns)
    .where(eq(storeReturns.id, returnId))
    .limit(1);

  if (!ret) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Return not found' });
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
      .innerJoin(storeOrderItems, eq(storeOrderItems.id, storeReturnItems.orderItemId))
      .where(eq(storeReturnItems.returnId, returnId))
      .limit(200);

    amountCents = returnItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  }

  await db.update(storeReturns)
    .set({ status: 'approved', refundAmountCents: amountCents, updatedAt: new Date() })
    .where(eq(storeReturns.id, returnId));

  logger.info('Return approved', { returnId, refundAmountCents: amountCents });
}

// ─── Receive Return ───────────────────────────────────────────────────────

export async function receiveReturn(returnId: string, restockItems = true): Promise<void> {
  const [ret] = await db
    .select({ id: storeReturns.id, orderId: storeReturns.orderId })
    .from(storeReturns)
    .where(eq(storeReturns.id, returnId))
    .limit(1);

  if (!ret) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Return not found' });
  }

  await db.update(storeReturns)
    .set({ status: 'received', updatedAt: new Date() })
    .where(eq(storeReturns.id, returnId));

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
      .innerJoin(storeOrderItems, eq(storeOrderItems.id, storeReturnItems.orderItemId))
      .where(eq(storeReturnItems.returnId, returnId))
      .limit(200);

    for (const item of returnItems) {
      // Only restock unopened items by default
      if (item.condition !== 'unopened') continue;

      if (item.variantId) {
        await db.update(storeProductVariants)
          .set({ stockQuantity: sql`${storeProductVariants.stockQuantity} + ${item.quantity}` })
          .where(eq(storeProductVariants.id, item.variantId));
      } else if (item.productId) {
        await db.update(storeProducts)
          .set({ stockQuantity: sql`${storeProducts.stockQuantity} + ${item.quantity}` })
          .where(eq(storeProducts.id, item.productId));
      }
    }

    logger.info('Return items restocked', { returnId });
  }

  logger.info('Return received', { returnId });
}

// ─── Process Return Refund ────────────────────────────────────────────────

export async function processReturnRefund(returnId: string): Promise<{ refundId?: string }> {
  const [ret] = await db
    .select({
      id: storeReturns.id,
      orderId: storeReturns.orderId,
      refundAmountCents: storeReturns.refundAmountCents,
    })
    .from(storeReturns)
    .where(eq(storeReturns.id, returnId))
    .limit(1);

  if (!ret) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Return not found' });
  }

  if (!ret.refundAmountCents) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Return has no refund amount set — approve first' });
  }

  // Get order details for refund handler
  const [order] = await db
    .select({
      paymentTransactionId: storeOrders.paymentTransactionId,
      currency: storeOrders.currency,
      totalCents: storeOrders.totalCents,
    })
    .from(storeOrders)
    .where(eq(storeOrders.id, ret.orderId))
    .limit(1);

  if (!order) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
  }

  let refundId: string | undefined;
  const handler = getRefundHandler();

  if (handler && order.paymentTransactionId) {
    const result = await handler.refundPayment({
      orderId: ret.orderId,
      transactionId: order.paymentTransactionId,
      amountCents: ret.refundAmountCents,
      currency: order.currency,
      reason: 'return',
    });
    refundId = result.refundId;
  }

  await db.update(storeReturns)
    .set({ status: 'refunded', refundedAt: new Date(), updatedAt: new Date() })
    .where(eq(storeReturns.id, returnId));

  // Check if this is a full or partial refund relative to the order
  const isFullRefund = ret.refundAmountCents >= order.totalCents;
  await updateOrderStatus(
    ret.orderId,
    isFullRefund ? 'refunded' : 'partially_refunded',
    'system',
    `Return refund processed (${ret.refundAmountCents} cents)`,
  );

  logger.info('Return refund processed', { returnId, refundId, amountCents: ret.refundAmountCents });

  return { refundId };
}

// ─── Reject Return ────────────────────────────────────────────────────────

export async function rejectReturn(returnId: string, adminNote: string): Promise<void> {
  const [ret] = await db
    .select({ id: storeReturns.id })
    .from(storeReturns)
    .where(eq(storeReturns.id, returnId))
    .limit(1);

  if (!ret) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Return not found' });
  }

  await db.update(storeReturns)
    .set({ status: 'rejected', adminNote, updatedAt: new Date() })
    .where(eq(storeReturns.id, returnId));

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
      .innerJoin(storeOrderItems, eq(storeOrderItems.id, storeReturnItems.orderItemId))
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
export async function getAlreadyReturnedQuantities(orderId: string): Promise<Map<string, number>> {
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
        ne(storeReturns.status, 'rejected'),
      ),
    )
    .groupBy(storeReturnItems.orderItemId)
    .limit(200);

  return new Map(rows.map((r) => [r.orderItemId, r.totalQty]));
}
