# core-affiliates — CLAUDE.md

Paid module. Referral tracking, marketing attribution, and affiliate management.

## Module Boundary

**core-affiliates owns:** Affiliate/referral/attribution schema, affiliate + attributions routers, captureReferral/recordConversion/captureAttribution lib functions, AttributionCapture component.

**Project owns:** Admin pages (`dashboard/settings/affiliates/`), account page (`account/affiliates/`), AffiliateOverview billing widget, dependency wiring (`config/affiliates-deps.ts`).

## Import Rules

- Imports from `@/core/*` (core utilities — logger, audit, admin-crud)
- Framework conventions imported directly: `@/server/trpc`, `@/server/db`, `@/server/db/schema/auth`
- Payment transactions table injected via `setAffiliatesDeps()` (avoids hard dep on core-billing)
- Project imports from `@/core-affiliates/*`
- Core (`src/core/`) never imports from core-affiliates

## Dependency Injection

`deps.ts` defines `AffiliatesDeps`. Injected deps:

- **paymentTransactionsTable** — Drizzle table ref for attribution revenue breakdowns (from core-billing). Pass null if billing not installed — breakdowns show 0 revenue.
- **getRevenueByUsers** — reserved for future use

## Wiring Into a Project

1. **Deps:** Create `config/affiliates-deps.ts` calling `setAffiliatesDeps()`, import in `server.ts`
2. **Routers:** Import `affiliatesRouter` + `attributionsRouter` in `_app.ts`
3. **Schema:** Re-export tables from `schema/index.ts`
4. **Component:** Use `AttributionCapture` in public layout
5. **Auth:** Call `captureAttribution()` from auth router's captureAttribution procedure
6. **Webhooks:** Call `recordConversion()` from payment webhook handlers

## Cross-Module Dependencies

- core-affiliates → core-billing: optional (via injected `paymentTransactionsTable`)
- core-billing → core-affiliates: none (getAffiliateStats lives in affiliates router)
