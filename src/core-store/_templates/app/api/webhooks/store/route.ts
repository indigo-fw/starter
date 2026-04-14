import { NextResponse } from 'next/server';
import { handleStorePaymentEvent } from '@/core-store/lib/webhook-handler';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-webhook');

/**
 * Store payment webhook handler.
 *
 * This is a template — customize for your payment provider (Stripe, PayPal, etc.).
 * For Stripe store orders routed through a unified Stripe webhook, you can call
 * handleStorePaymentEvent() directly from there instead of using this route.
 */
export async function POST(request: Request) {
  // TODO: Verify webhook signature (provider-specific).
  // For Stripe: use stripe.webhooks.constructEvent(body, sig, secret)
  // For PayPal: verify via PayPal API or shared secret
  // Reject unverified requests in production.

  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // TODO: Map your provider's payload shape to StoreWebhookEventData.
  // The fields below assume a generic structure — adjust for your provider.
  const orderId = payload.orderId as string | undefined;
  const eventType = payload.eventType as string | undefined;
  const eventId = payload.eventId as string | undefined;
  const providerId = payload.providerId as string | undefined;
  const transactionId = payload.transactionId as string | undefined;

  if (!orderId || !eventType || !eventId || !providerId) {
    logger.warn('Store webhook: missing required fields', { payload });
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const result = await handleStorePaymentEvent({
      orderId,
      eventType,
      eventId,
      providerId,
      transactionId,
    });

    if (!result.processed && result.reason === 'duplicate') {
      return NextResponse.json({ received: true, duplicate: true });
    }

    return NextResponse.json({ received: true, processed: result.processed });
  } catch (err) {
    logger.error('Store webhook processing failed', { error: String(err) });
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
