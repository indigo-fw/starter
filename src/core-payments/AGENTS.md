# core-payments — AGENTS.md

Multi-provider payment infrastructure — provider registry, Stripe integration, transaction tracking.

**Project owns:** Provider configs (`config/payment-providers.ts`), `config/deps/payments-deps.ts`, webhook routes.

## Org Scoping

Payments are org-scoped, not user-scoped: `saas_payment_transactions.organizationId` is required (FK, cascade); `userId` is optional attribution only. Resolve the org via DI `resolveOrgId` — never key transactions by user.

## DI (`setPaymentsDeps()`)

`getEnabledProviderConfigs`, `getPlan` / `getPlanByProviderPriceId` / `getProviderPriceId`, `resolveOrgId`, `broadcastEvent`; optional: `getActiveSubscriptionForOrg`, `handleSubscriptionWebhookEvent` (subscription fallback for `dispatchPaymentEvent` — without it recovered subscription payments cannot be fulfilled).

## Provider Registry

`registerPaymentProvider(id, factory)` — Stripe built-in, others (e.g. `core-payments-crypto`) register via side-effect import.

Cross-module: Stripe customer lookup uses optional `getActiveSubscriptionForOrg` from DI.

## One-Time Payment Webhook Registry

`registerPaymentWebhookHandler(metadataType, handler)` (`lib/webhook-registry.ts`) — checkouts tag
sessions with `metadata.type` ('store_order', 'token_pack', …); modules register their handler from
`config/deps/*` wiring and every provider webhook route consults the registry. New one-time purchase
flows plug in without editing provider routes. Handler throw → route 500s + releases its idempotency
claim → provider retries. Unmatched types fall through to the subscription webhook handler.
Providers declare `supportsOneTimePayments` in their config; UIs must check it before offering
one-time checkouts (the crypto provider doesn't support them).

`dispatchPaymentEvent()` (same file) is that routing as one function: registry handler by
`metadata.type`, else `PaymentsDeps.handleSubscriptionWebhookEvent` (optional DI — project wires
it to core-subscriptions' `handleSubscriptionWebhookEvent`); throws `NOT_IMPLEMENTED` when nothing
can take the event so the caller releases its idempotency claim. Routes still inline the same two
branches and may switch to the helper.

## Reconciliation (`lib/reconciliation-service.ts`)

Daily sweep (via dunning) over PENDING rows older than 24 h. The row is the state machine: every
write is a CAS on `status = pending`, so a late webhook always wins. A row the sweep moves to
SUCCESSFUL is **fulfilled** through `dispatchPaymentEvent` with a synthesised event
(`payment.completed` for a registered one-time type, else `subscription.activated`), idempotency
key `reconcile:<txId>` — never the provider event id. Fulfilment failure keeps SUCCESSFUL (money
was taken), records `rawResponse.reconciliation.fulfilment = 'failed'` and counts
`fulfilmentFailed` → manual fulfilment. Checkers answer `successful | failed | pending | unknown`:
only an explicit `pending` (or no provider record) ages into `abandoned` → FAILED after 24 h;
`unknown` (outage, auth, rate limit) never does. Rows without `providerTxId` use the checker's
optional `findByMerchantReference`, else abandon on the same rule. A provider webhook landing
later may still resurrect an abandoned row (NOWPayments does).
