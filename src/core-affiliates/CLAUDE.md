# core-affiliates — CLAUDE.md

Referral tracking, marketing attribution, and affiliate management.

## Module Boundary

**core-affiliates owns:** Affiliate/referral/attribution schema, routers, `captureReferral`/`recordConversion`/`captureAttribution` lib functions, `AttributionCapture` component.

**Project owns:** Admin pages, account page, `AffiliateOverview` widget, `config/deps/affiliates-deps.ts`.

## DI (`setAffiliatesDeps()`)

- `paymentTransactionsTable` — Drizzle table ref for revenue breakdowns (from core-payments). Pass `null` if billing not installed
- `getRevenueByUsers` — reserved for future use

## Wiring

1. Create `config/deps/affiliates-deps.ts` → import in `server.ts`
2. Routers auto-registered via `indigo:sync`
3. Use `AttributionCapture` in public layout
4. Call `captureAttribution()` from auth, `recordConversion()` from payment webhooks

**Cross-module:** optional dep on core-payments (via injected table ref).
