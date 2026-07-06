import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasSubscriptionEvents } from '@/server/db/schema';
import { getProvider } from '@/core-payments/lib/factory';
import { getPaymentWebhookHandler } from '@/core-payments/lib/webhook-registry';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('stripe-webhook');

/**
 * Release the idempotency claim for a failed event so Stripe's automatic
 * retry is processed instead of being swallowed as a duplicate. Best-effort:
 * if the delete itself fails, the event needs manual replay.
 */
async function releaseEventClaim(stripeEventId: string): Promise<void> {
  try {
    await db.delete(saasSubscriptionEvents).where(
      and(
        eq(saasSubscriptionEvents.providerId, 'stripe'),
        eq(saasSubscriptionEvents.providerEventId, stripeEventId),
      )
    );
  } catch (err) {
    logger.error('Failed to release webhook idempotency claim — replay manually', {
      stripeEventId,
      error: String(err),
    });
  }
}

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

  // ── Route one-time purchases by checkout metadata.type ────────────────────
  // Modules register handlers ('store_order', 'token_pack', …) at server
  // init via registerPaymentWebhookHandler(); unmatched events fall through
  // to the subscription handler below.
  const eventMetadata = (event.providerData as Record<string, unknown>)?.metadata as Record<string, string> | undefined;
  const oneTimeHandler = getPaymentWebhookHandler(eventMetadata?.type);
  if (oneTimeHandler) {
    try {
      const result = await oneTimeHandler({
        event,
        providerId: 'stripe',
        eventId: stripeEventId,
        metadata: eventMetadata ?? {},
      });
      return NextResponse.json({ received: true, ...(result ?? {}) });
    } catch (err) {
      logger.error('Error processing one-time payment webhook', { type: eventMetadata?.type, error: String(err) });
      await releaseEventClaim(stripeEventId);
      return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
  }

  // ── Route subscription events (dynamic — core-subscriptions may not be installed) ──
  try {
    const { handleSubscriptionWebhookEvent } = await import('@/core-subscriptions/lib/webhook-handler');
    await handleSubscriptionWebhookEvent({ event, providerId: 'stripe' });
  } catch (err) {
    logger.error('Error processing Stripe subscription webhook', { error: String(err) });
    await releaseEventClaim(stripeEventId);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
