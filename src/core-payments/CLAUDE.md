# core-payments — CLAUDE.md

Multi-provider payment infrastructure — provider registry, Stripe integration, transaction tracking.

## Module Boundary

**core-payments owns:** Payment schema (events + transactions tables), Stripe provider, provider factory/registry, payment types.

**Project owns:** Provider configs (`config/payment-providers.ts`), `config/payments-deps.ts`, webhook routes.

## DI (`setPaymentsDeps()`)

`getEnabledProviderConfigs`, `getPlan` / `getPlanByProviderPriceId` / `getProviderPriceId`, `resolveOrgId`, `broadcastEvent`.

## Provider Registry

`registerPaymentProvider(id, factory)` — Stripe built-in, others (e.g. `core-payments-crypto`) register via side-effect import.

Cross-module: Stripe customer lookup uses optional `getActiveSubscriptionForOrg` from DI.
