# core-payments — CLAUDE.md

Multi-provider payment infrastructure — provider registry, Stripe integration, transaction tracking.

**Project owns:** Provider configs (`config/payment-providers.ts`), `config/deps/payments-deps.ts`, webhook routes.

## Org Scoping

Payments are org-scoped, not user-scoped: `saas_payment_transactions.organizationId` is required (FK, cascade); `userId` is optional attribution only. Resolve the org via DI `resolveOrgId` — never key transactions by user.

## DI (`setPaymentsDeps()`)

`getEnabledProviderConfigs`, `getPlan` / `getPlanByProviderPriceId` / `getProviderPriceId`, `resolveOrgId`, `broadcastEvent`.

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
