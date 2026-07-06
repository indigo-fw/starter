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
 */
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
  ctx: PaymentWebhookContext,
) => Promise<Record<string, unknown> | void>;

const handlers = new Map<string, PaymentWebhookHandler>();

/** Register the handler for a checkout `metadata.type`. Last write wins. */
export function registerPaymentWebhookHandler(metadataType: string, handler: PaymentWebhookHandler): void {
  handlers.set(metadataType, handler);
}

export function getPaymentWebhookHandler(metadataType: string | undefined): PaymentWebhookHandler | undefined {
  return metadataType ? handlers.get(metadataType) : undefined;
}

/** Reset the registry. Primary use is in tests. */
export function clearPaymentWebhookHandlers(): void {
  handlers.clear();
}
