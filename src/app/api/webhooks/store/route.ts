import { NextResponse } from 'next/server';
import { getProvider } from '@/core-payments/lib/factory';
import { handleStorePaymentEvent } from '@/core-store/lib/webhook-handler';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-webhook');

/**
 * Payment webhook handler for store orders (non-Stripe providers).
 *
 * Stripe store orders are routed through /api/webhooks/stripe which
 * detects store orders via metadata.type === 'store_order'.
 *
 * This endpoint handles non-Stripe providers (crypto, future providers)
 * via the ?provider= query parameter.
 */
export async function POST(request: Request) {
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

  const eventId = (event.providerData?._eventId as string) ?? `${providerId}-${orderId}-${event.type}`;

  try {
    const result = await handleStorePaymentEvent({
      orderId,
      eventType: event.type,
      eventId,
      providerId,
      transactionId: event.providerData?.transactionId as string | undefined,
    });
    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    logger.error('Store webhook processing error', { error: String(err), orderId });
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }
}
