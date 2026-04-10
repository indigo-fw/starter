import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { storeOrders, storeOrderEvents } from '@/core-store/schema/orders';
import { updateOrderStatus } from '@/core-store/lib/order-service';
import { getStoreDeps } from '@/core-store/deps';
import { getProvider } from '@/core-payments/lib/factory';
import { createLogger } from '@/core/lib/infra/logger';
import { logAudit } from '@/core/lib/infra/audit';

const logger = createLogger('store-webhook');

/**
 * Payment webhook handler for store orders.
 *
 * Called by payment providers (Stripe, crypto, etc.) after a checkout session
 * completes or fails. Updates order status and notifies the customer.
 *
 * The core-payments `WebhookEvent` type is subscription-focused, so for store
 * one-time payments we check: if `event.type` is NOT `payment.failed` and NOT
 * `payment.refunded`, we treat it as a successful payment.
 *
 * The order ID is passed through `providerData.metadata.orderId`.
 */
export async function POST(request: Request) {
  // Determine provider from query param (e.g. /api/webhooks/store?provider=stripe)
  const url = new URL(request.url);
  const providerId = url.searchParams.get('provider') ?? 'stripe';

  const provider = await getProvider(providerId);
  if (!provider) {
    logger.warn('Store webhook: provider not configured', { providerId });
    return NextResponse.json({ error: 'Provider not configured' }, { status: 503 });
  }

  // Verify webhook signature
  const clonedRequest = request.clone();
  let event;
  try {
    event = await provider.handleWebhook(clonedRequest);
  } catch (err) {
    logger.error('Store webhook verification failed', { error: String(err), providerId });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (!event) {
    return NextResponse.json({ error: 'No event' }, { status: 400 });
  }

  // Extract order ID from provider metadata
  const metadata = (event.providerData?.metadata ?? {}) as Record<string, unknown>;
  const orderId = metadata.orderId as string | undefined;
  if (!orderId) {
    logger.info('Store webhook: no orderId in metadata, skipping', { eventType: event.type });
    return NextResponse.json({ received: true, skipped: 'no orderId' });
  }

  // Idempotency: log webhook event, skip on duplicate
  const eventId = (event.providerData?._eventId as string) ?? `${providerId}-${orderId}-${event.type}`;
  try {
    await db.insert(storeOrderEvents).values({
      orderId,
      status: event.type === 'payment.failed' ? 'payment_failed' : 'payment_received',
      note: `Webhook: ${event.type}`,
      actor: 'system',
      metadata: { eventId, providerId },
    });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('duplicate') || msg.includes('unique')) {
      logger.info('Store webhook: duplicate event, skipping', { eventId });
      return NextResponse.json({ received: true, duplicate: true });
    }
    logger.warn('Store webhook: event insert error (non-duplicate)', { error: msg });
  }

  try {
    // Verify order exists
    const [order] = await db
      .select({ id: storeOrders.id, status: storeOrders.status, userId: storeOrders.userId })
      .from(storeOrders)
      .where(eq(storeOrders.id, orderId))
      .limit(1);

    if (!order) {
      logger.warn('Store webhook: order not found', { orderId });
      return NextResponse.json({ received: true, skipped: 'order not found' });
    }

    const isFailure = event.type === 'payment.failed' || event.type === 'payment.refunded';

    if (!isFailure) {
      // ── Payment success ──────────────────────────────────────────────
      if (order.status !== 'pending') {
        logger.info('Store webhook: order already past pending', { orderId, status: order.status });
        return NextResponse.json({ received: true, skipped: 'already processed' });
      }

      await updateOrderStatus(orderId, 'processing', 'system', 'Payment confirmed via webhook');

      // Store payment transaction ID if available
      const transactionId = event.providerData?.transactionId as string | undefined;
      if (transactionId) {
        await db.update(storeOrders)
          .set({ paymentTransactionId: transactionId, paidAt: new Date() })
          .where(eq(storeOrders.id, orderId));
      }

      // Notify customer
      const deps = getStoreDeps();
      deps.sendNotification({
        userId: order.userId,
        title: 'Payment confirmed',
        body: 'Your order is being processed.',
      });

      await deps.enqueueTemplateEmail(
        order.userId,
        'order-confirmation',
        { orderId },
      ).catch((err) => logger.warn('Failed to enqueue order email', { error: String(err) }));

      logAudit({
        db,
        userId: order.userId,
        action: 'store.order.paid',
        entityType: 'store_order',
        entityId: orderId,
      });

      logger.info('Store order payment confirmed', { orderId, transactionId });
    } else {
      // ── Payment failure ──────────────────────────────────────────────
      const deps = getStoreDeps();
      deps.sendNotification({
        userId: order.userId,
        title: 'Payment issue',
        body: event.type === 'payment.refunded'
          ? 'Your payment was refunded.'
          : 'There was an issue with your payment. Please try again.',
      });

      if (event.type === 'payment.refunded' && order.status !== 'refunded') {
        await updateOrderStatus(orderId, 'refunded', 'system', 'Payment refunded via webhook');
      }

      logger.warn('Store order payment issue', { orderId, type: event.type });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error('Store webhook processing error', { error: String(err), orderId });
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }
}
