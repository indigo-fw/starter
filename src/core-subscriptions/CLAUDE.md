# core-subscriptions -- CLAUDE.md

Free subscription lifecycle module. Subscription management, tokens, discounts, feature gates, and dunning.

## Module Boundary

**core-subscriptions owns:** Subscription schema (5 tables), billing/discount-codes routers, subscription/discount/token/feature-gate services, dunning job, billing types.

**Project owns:** Plan definitions (`config/plans.ts`), billing admin pages, dependency wiring (`config/subscriptions-deps.ts`).

## Import Rules

- core-subscriptions imports from `@/core/*` (core utilities)
- Framework conventions imported directly: `@/server/trpc`, `@/server/db`, `@/server/db/schema/auth`, `@/server/db/schema/organization`, `@/server/db/schema/audit`
- Cross-module: payment provider/transaction access via DI (injected in subscriptions-deps.ts). Only type imports from `@/core-payments/types/payment` (DiscountType enum, type interfaces)
- Project-specific behavior injected via `setSubscriptionsDeps()`
- Project imports from `@/core-subscriptions/*`
- Core (`src/core/`) never imports from core-subscriptions

## Dependency Injection

`deps.ts` defines `SubscriptionsDeps`. Project calls `setSubscriptionsDeps()` at startup. Injected deps:

- **getPlans / getPlan / getPlanByProviderPriceId / getProviderPriceId** -- plan definitions
- **resolveOrgId** -- resolve active org for a user
- **sendOrgNotification** -- notify org members
- **enqueueTemplateEmail** -- send dunning/lifecycle emails
- **broadcastEvent** -- WS broadcast (token balance updates)

## Wiring Into a Project

1. **Deps:** Create `config/subscriptions-deps.ts` calling `setSubscriptionsDeps()`, import in `server.ts`
2. **Routers:** Import `billingRouter` + `discountCodesRouter` in `_app.ts`
3. **Schema:** Re-export subscription tables from `schema/index.ts`
4. **Plans:** Define plans in `config/plans.ts`, call `setPlanResolver()` for feature-gate
5. **Dunning:** Import in `server.ts` job setup
6. **Webhooks:** Keep in `app/api/webhooks/` (Next.js routing requirement)
