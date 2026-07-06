import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { saasSubscriptionEvents } from '@/server/db/schema';
import { getProvider } from '@/core-payments/lib/factory';
import { getPaymentWebhookHandler } from '@/core-payments/lib/webhook-registry';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('nowpayments-webhook');

export async function POST(request: Request) {
  const provider = await getProvider('nowpayments');
  if (!provider) {
    return NextResponse.json({ error: 'NOWPayments not configured' }, { status: 503 });
  }

  let event;
  try {
    event = await provider.handleWebhook(request);
  } catch (err) {
    logger.error('NOWPayments webhook verification failed', { error: String(err) });
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
  }

  // Idempotency check
  const providerData = event.providerData as Record<string, unknown> | undefined;
  const orderId = providerData?.order_id as string | undefined;
  const idempotencyKey = orderId ? `np_${orderId}` : null;

  if (idempotencyKey) {
    try {
      await db.insert(saasSubscriptionEvents).values({
        providerId: 'nowpayments',
        providerEventId: idempotencyKey,
        type: event.type,
        data: providerData as Record<string, unknown>,
      });
    } catch (err) {
      if (String(err).includes('unique') || String(err).includes('duplicate')) {
        return NextResponse.json({ received: true, duplicate: true });
      }
      throw err;
    }
  }

  // ── Route one-time purchases by checkout metadata.type ────────────────────
  // Same registry the Stripe route consults — future crypto one-time flows
  // plug in here without route edits. Unmatched events fall through to the
  // subscription handler (today's only NOWPayments flow).
  const eventMetadata = providerData?.metadata as Record<string, string> | undefined;
  const oneTimeHandler = getPaymentWebhookHandler(eventMetadata?.type);
  if (oneTimeHandler && idempotencyKey) {
    try {
      const result = await oneTimeHandler({
        event,
        providerId: 'nowpayments',
        eventId: idempotencyKey,
        metadata: eventMetadata ?? {},
      });
      return NextResponse.json({ received: true, ...(result ?? {}) });
    } catch (err) {
      logger.error('Error processing NOWPayments one-time webhook', { type: eventMetadata?.type, error: String(err) });
      return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
  }

  try {
    const { handleSubscriptionWebhookEvent } = await import('@/core-subscriptions/lib/webhook-handler');
    await handleSubscriptionWebhookEvent({ event, providerId: 'nowpayments' });
  } catch (err) {
    logger.error('Error processing NOWPayments webhook', { error: String(err) });
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
