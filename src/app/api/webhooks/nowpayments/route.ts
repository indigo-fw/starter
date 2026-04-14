import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { saasSubscriptionEvents } from '@/server/db/schema';
import { getProvider } from '@/core-payments/lib/factory';
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

  try {
    const { handleSubscriptionWebhookEvent } = await import('@/core-subscriptions/lib/webhook-handler');
    await handleSubscriptionWebhookEvent({ event, providerId: 'nowpayments' });
  } catch (err) {
    logger.error('Error processing NOWPayments webhook', { error: String(err) });
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
