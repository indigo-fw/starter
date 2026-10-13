/**
 * One-time payment webhook routing registry.
 *
 * Checkouts tag their sessions with a `metadata.type` ('store_order',
 * 'token_pack', …). Modules register a handler for their type at server init
 * (from their `config/deps/*` wiring); provider webhook routes look the type
 * up here instead of hardcoding per-module branches — new one-time purchase
 * flows (donations, gift cards, credits) plug in without editing any
 * provider route.
 *
 * Handlers run AFTER signature verification and the idempotency claim. A
 * handler that throws makes the route return 500 and release the claim, so
 * the provider retries. Events whose type has no registered handler fall
 * through to the subscription webhook handler (the historical default).
 *
 * `dispatchPaymentEvent()` is that routing as one function: it is what the
 * reconciliation sweep calls to fulfil a recovered payment, so recovery and
 * a live webhook can never drift apart. The provider routes still inline the
 * same two branches today; they can switch to the helper without behaviour
 * change once `PaymentsDeps.handleSubscriptionWebhookEvent` is wired.
 */
import { TRPCError } from '@trpc/server';

import { getPaymentsDeps } from '@/core-payments/deps';
import type { WebhookEvent } from '@/core-payments/types/payment';

export interface PaymentWebhookContext {
  event: WebhookEvent;
  providerId: string;
  /** Provider event ID (already recorded in the idempotency table) */
  eventId: string;
  /** Checkout metadata echoed back by the provider */
  metadata: Record<string, string>;
}

export type PaymentWebhookHandler = (
  ctx: PaymentWebhookContext
) => Promise<Record<string, unknown> | void>;

const handlers = new Map<string, PaymentWebhookHandler>();

/** Register the handler for a checkout `metadata.type`. Last write wins. */
export function registerPaymentWebhookHandler(
  metadataType: string,
  handler: PaymentWebhookHandler
): void {
  handlers.set(metadataType, handler);
}

export function getPaymentWebhookHandler(
  metadataType: string | undefined
): PaymentWebhookHandler | undefined {
  return metadataType ? handlers.get(metadataType) : undefined;
}

/** Reset the registry. Primary use is in tests. */
export function clearPaymentWebhookHandlers(): void {
  handlers.clear();
}

/** The checkout metadata a provider echoed back on the event, if any. */
export function readEventMetadata(event: WebhookEvent): Record<string, string> {
  const metadata = event.providerData?.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    metadata as Record<string, unknown>
  )) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

export interface DispatchPaymentEventParams {
  event: WebhookEvent;
  providerId: string;
  /** Idempotency key already claimed by the caller (provider event id, or `reconcile:<txId>`). */
  eventId: string;
}

/**
 * Route a verified, claimed payment event the way the provider webhook routes
 * do: the one-time registry handler for `metadata.type`, else the subscription
 * handler injected through `PaymentsDeps`. Throws when nothing can take the
 * event — swallowing it would report success for a payment nobody fulfilled,
 * so the caller must release its claim and surface the failure.
 */
export async function dispatchPaymentEvent({
  event,
  providerId,
  eventId,
}: DispatchPaymentEventParams): Promise<Record<string, unknown> | void> {
  const metadata = readEventMetadata(event);
  const oneTimeHandler = getPaymentWebhookHandler(metadata.type);
  if (oneTimeHandler) {
    return oneTimeHandler({ event, providerId, eventId, metadata });
  }

  const handleSubscriptionWebhookEvent =
    getPaymentsDeps().handleSubscriptionWebhookEvent;
  if (!handleSubscriptionWebhookEvent) {
    throw new TRPCError({
      code: 'NOT_IMPLEMENTED',
      message:
        `No handler for payment event '${event.type}' (metadata.type=${metadata.type ?? 'none'}) — ` +
        'register one with registerPaymentWebhookHandler() or wire PaymentsDeps.handleSubscriptionWebhookEvent',
    });
  }
  await handleSubscriptionWebhookEvent({ event, providerId });
}
