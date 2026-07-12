import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasSubscriptionEvents } from '@/server/db/schema';
import { getProvider } from '@/core-payments/lib/factory';
import { getPaymentWebhookHandler } from '@/core-payments/lib/webhook-registry';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('nowpayments-webhook');

/**
 * Release the idempotency claim for a failed event so NOWPayments' automatic
 * IPN retry is processed instead of being swallowed as a duplicate. Best-effort:
 * if the delete itself fails, the event needs manual replay.
 */
async function releaseEventClaim(idempotencyKey: string): Promise<void> {
  try {
    await db.delete(saasSubscriptionEvents).where(
      and(
        eq(saasSubscriptionEvents.providerId, 'nowpayments'),
        eq(saasSubscriptionEvents.providerEventId, idempotencyKey),
      )
    );
  } catch (err) {
    logger.error('Failed to release webhook idempotency claim — replay manually', {
      idempotencyKey,
      error: String(err),
    });
  }
}

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

  // Idempotency: NOWPayments sends one IPN per status change, and non-final
  // statuses (waiting/confirming/partially_paid) surface as subscription.updated
  // carrying the same order_id. Keying on order_id alone lets the first
  // non-final IPN claim the key and dedupe away the decisive `finished` IPN.
  // Key per payment *event* instead — payment_id + payment_status is stable
  // per delivery but distinct across transitions; fall back to order_id when
  // payment_id is absent.
  const providerData = event.providerData as Record<string, unknown> | undefined;
  const orderId = providerData?.order_id as string | undefined;
  const paymentId = providerData?.payment_id as string | number | undefined;
  const paymentStatus = providerData?.payment_status as string | undefined;
  const eventDiscriminator = paymentId != null ? String(paymentId) : orderId;
  const idempotencyKey = eventDiscriminator
    ? `np_${eventDiscriminator}_${paymentStatus ?? event.type}`
    : null;

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
      await releaseEventClaim(idempotencyKey);
      return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }
  }

  try {
    const { handleSubscriptionWebhookEvent } = await import('@/core-subscriptions/lib/webhook-handler');
    await handleSubscriptionWebhookEvent({ event, providerId: 'nowpayments' });
  } catch (err) {
    logger.error('Error processing NOWPayments webhook', { error: String(err) });
    if (idempotencyKey) await releaseEventClaim(idempotencyKey);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
