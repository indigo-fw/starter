import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { saasSubscriptionEvents } from '@/server/db/schema';
import { getProvider } from '@/core-payments/lib/factory';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('stripe-webhook');

export async function POST(request: Request) {
  const stripeProvider = await getProvider('stripe');
  if (!stripeProvider) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  const clonedRequest = request.clone();

  let event;
  try {
    event = await stripeProvider.handleWebhook(clonedRequest);
  } catch (err) {
    logger.error('Stripe webhook verification failed', { error: String(err) });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency check via _eventId set by the Stripe provider
  const stripeEventId = (event.providerData as Record<string, unknown>)?._eventId as string | undefined;
  if (!stripeEventId) {
    return NextResponse.json({ error: 'Missing event ID' }, { status: 400 });
  }

  // Atomic idempotency: INSERT or bail if already processed
  try {
    await db.insert(saasSubscriptionEvents).values({
      providerId: 'stripe',
      providerEventId: stripeEventId,
      type: event.type,
      data: event.providerData as Record<string, unknown>,
    });
  } catch (err) {
    if (String(err).includes('unique') || String(err).includes('duplicate')) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw err;
  }

  // ── Route store order events (dynamic — core-store may not be installed) ──
  const eventMetadata = (event.providerData as Record<string, unknown>)?.metadata as Record<string, string> | undefined;
  if (eventMetadata?.type === 'store_order' && eventMetadata?.orderId) {
    try {
      const { handleStorePaymentEvent } = await import('@/core-store/lib/webhook-handler');
      const result = await handleStorePaymentEvent({
        orderId: eventMetadata.orderId,
        eventType: event.type,
        eventId: stripeEventId,
        providerId: 'stripe',
        transactionId: (event.providerData as Record<string, unknown>)?.transactionId as string | undefined,
      });
      return NextResponse.json({ received: true, ...result });
    } catch (err) {
      logger.error('Error processing store order webhook', { error: String(err) });
      return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
  }

  // ── Route subscription events (dynamic — core-subscriptions may not be installed) ──
  try {
    const { handleSubscriptionWebhookEvent } = await import('@/core-subscriptions/lib/webhook-handler');
    await handleSubscriptionWebhookEvent({ event, providerId: 'stripe' });
  } catch (err) {
    logger.error('Error processing Stripe subscription webhook', { error: String(err) });
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
