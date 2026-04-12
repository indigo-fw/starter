# core-payments -- CLAUDE.md

Free payment processing infrastructure module. Multi-provider payment system with provider registry, Stripe integration, and payment transaction tracking.

## Module Boundary

**core-payments owns:** Payment schema (2 tables: events + transactions), Stripe provider, provider factory/registry, payment types, Stripe utilities.

**Project owns:** Provider configs (`config/payment-providers.ts`), dependency wiring (`config/payments-deps.ts`), webhook routes (`app/api/webhooks/`).

## Import Rules

- core-payments imports from `@/core/*` (core utilities)
- Framework conventions imported directly: `@/server/db`, `@/server/db/schema/organization`
- Cross-module: Stripe customer lookup uses optional `getActiveSubscriptionForOrg` from DI (no direct schema import)
- Project-specific behavior injected via `setPaymentsDeps()`
- Project imports from `@/core-payments/*`
- Core (`src/core/`) never imports from core-payments

## Dependency Injection

`deps.ts` defines `PaymentsDeps`. Project calls `setPaymentsDeps()` at startup. Injected deps:

- **getEnabledProviderConfigs** -- which payment providers are enabled
- **getPlan / getPlanByProviderPriceId / getProviderPriceId** -- plan price resolution for providers
- **resolveOrgId** -- resolve active org for a user
- **broadcastEvent** -- WS broadcast

## Provider Registry

Providers register via `registerPaymentProvider(id, factory)`. Stripe is built-in. Additional providers (e.g., `core-billing-crypto`) register via their own `register.ts` side-effect import.
