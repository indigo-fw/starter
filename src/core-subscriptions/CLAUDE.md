# core-subscriptions — CLAUDE.md

Subscription lifecycle — management, tokens, discounts, feature gates, dunning.

**Token functions live here:** `addTokens()`, `deductTokens()` — atomic `UPDATE WHERE balance >= amount` (race-safe). Not in core.

## Module Boundary

**core-subscriptions owns:** Subscription schema (5 tables), billing/discount-codes routers, subscription/discount/token/feature-gate services, dunning job.

**Project owns:** Plan definitions (`config/plans.ts`), billing admin pages, `config/deps/subscriptions-deps.ts`.

## DI (`setSubscriptionsDeps()`)

`getPlans` / `getPlan` / `getPlanByProviderPriceId` / `getProviderPriceId`, `resolveOrgId`, `sendOrgNotification`, `enqueueTemplateEmail`, `broadcastEvent`.

## Cross-module

Only type imports from `@/core-payments/types/payment` (enums + interfaces). Payment provider/transaction access via DI.

## Wiring

1. Create `config/deps/subscriptions-deps.ts` → import in `server.ts`
2. Define plans in `config/plans.ts`, call `setPlanResolver()` for feature-gate
3. Routers/schema auto-registered via `indigo:sync`
4. Webhook routes stay in `app/api/webhooks/`
