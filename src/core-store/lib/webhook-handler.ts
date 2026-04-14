/**
 * Reusable store payment webhook handler.
 *
 * Extracted from the store webhook route so it can be called from:
 * - The unified Stripe webhook (for Stripe store orders)
 * - The store webhook route (for non-Stripe providers)
 */

import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { storeOrders, storeOrderEvents } from '@/core-store/schema/orders';
import { updateOrderStatus, deductOrderInventory, restoreOrderInventory } from '@/core-store/lib/order-service';
import { getStoreDeps } from '@/core-store/deps';
import { logAudit } from '@/core/lib/infra/audit';
import { dispatchWebhook } from '@/core/lib/webhooks/webhooks';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-webhook-handler');

export interface StoreWebhookEventData {
  orderId: string;
  eventType: string;
  eventId: string;
  providerId: string;
  transactionId?: string;
}

/**
 * Handle a store payment webhook event.
 * Returns { processed, reason? } for the caller to build the response.
 */
export async function handleStorePaymentEvent(data: StoreWebhookEventData): Promise<{
  processed: boolean;
  reason?: string;
}> {
  const { orderId, eventType, eventId, providerId, transactionId } = data;

  // Idempotency: log webhook event, skip on duplicate
  try {
    await db.insert(storeOrderEvents).values({
      orderId,
      status: eventType === 'payment.failed' ? 'payment_failed' : 'payment_received',
      note: `Webhook: ${eventType}`,
      actor: 'system',
      metadata: { eventId, providerId },
    });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return { processed: false, reason: 'duplicate' };
    }
    logger.warn('Store webhook: event insert error (non-duplicate)', { error: msg });
  }

  // Verify order exists
  const [order] = await db
    .select({
      id: storeOrders.id,
      status: storeOrders.status,
      placedByUserId: storeOrders.placedByUserId,
      guestEmail: storeOrders.guestEmail,
      organizationId: storeOrders.organizationId,
      orderNumber: storeOrders.orderNumber,
      totalCents: storeOrders.totalCents,
      currency: storeOrders.currency,
    })
    .from(storeOrders)
    .where(eq(storeOrders.id, orderId))
    .limit(1);

  if (!order) {
    logger.warn('Store webhook: order not found', { orderId });
    return { processed: false, reason: 'order not found' };
  }

  const isFailure = eventType === 'payment.failed' || eventType === 'payment.refunded';

  if (!isFailure) {
    // ── Payment success ──────────────────────────────────────────────
    if (order.status !== 'pending') {
      return { processed: false, reason: 'already processed' };
    }

    await updateOrderStatus(orderId, 'processing', 'system', 'Payment confirmed via webhook');

    // Deduct inventory now that payment is confirmed
    await deductOrderInventory(orderId);

    if (transactionId) {
      await db.update(storeOrders)
        .set({ paymentTransactionId: transactionId, paidAt: new Date() })
        .where(eq(storeOrders.id, orderId));
    }

    const deps = getStoreDeps();

    const total = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: order.currency,
      minimumFractionDigits: 2,
    }).format(order.totalCents / 100);

    if (order.placedByUserId) {
      // Authenticated order — in-app notification + template email
      deps.sendNotification({
        userId: order.placedByUserId,
        title: 'Payment confirmed',
        body: 'Your order is being processed.',
      });

      await deps.enqueueTemplateEmail(
        order.placedByUserId,
        'order-confirmation',
        { orderId: order.id, orderNumber: order.orderNumber, total },
      ).catch((err) => logger.warn('Failed to enqueue order email', { error: String(err) }));
    } else if (order.guestEmail) {
      // Guest order — email only (no in-app notification)
      await deps.enqueueTemplateEmail(
        order.guestEmail,
        'order-confirmation',
        { orderId: order.id, orderNumber: order.orderNumber, total },
      ).catch((err) => logger.warn('Failed to enqueue guest order email', { error: String(err) }));
    }

    logAudit({
      db,
      userId: order.placedByUserId ?? 'guest',
      action: 'store.order.paid',
      entityType: 'store_order',
      entityId: orderId,
    });

    dispatchWebhook(db, 'store.order.paid', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalCents: order.totalCents,
      currency: order.currency,
    });

    logger.info('Store order payment confirmed', { orderId, transactionId });
  } else {
    // ── Payment failure / refund ─────────────────────────────────────
    const deps = getStoreDeps();
    if (order.placedByUserId) {
      deps.sendNotification({
        userId: order.placedByUserId,
        title: 'Payment issue',
        body: eventType === 'payment.refunded'
          ? 'Your payment was refunded.'
          : 'There was an issue with your payment. Please try again.',
      });
    }

    if (eventType === 'payment.refunded' && order.status !== 'refunded') {
      await updateOrderStatus(orderId, 'refunded', 'system', 'Payment refunded via webhook');
      // Restore inventory on refund (only if order was previously paid/processing)
      if (order.status === 'processing' || order.status === 'shipped' || order.status === 'delivered') {
        await restoreOrderInventory(orderId);
      }
    }

    logger.warn('Store order payment issue', { orderId, type: eventType });
  }

  return { processed: true };
}
