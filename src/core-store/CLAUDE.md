# core-store — CLAUDE.md

Paid module. E-commerce system — products, variants, cart, checkout, orders, shipping, tax (EU VAT compliant).

## Module Boundary

**core-store owns:** Product/variant/category schema, cart schema, order/invoice schema, shipping zone/rate schema, tax rate schema, all store routers, cart/tax/shipping/order services.

**Project owns:** Admin pages, storefront pages (product listing, product detail, cart, checkout, order history), dependency wiring (`config/store-deps.ts`), webhook handler for payment completion.

## Import Rules

- Imports from `@/core/*` (core utilities — slug, admin-crud, logger)
- Framework conventions: `@/server/trpc`, `@/server/db`
- Payment processing injected via `setStoreDeps()` (uses core-billing providers)
- Project imports from `@/core-store/*`

## Dependency Injection

`deps.ts` defines `StoreDeps`. Injected deps:

- **createPaymentCheckout** — create one-time payment session via core-billing providers
- **sendNotification** — notify customer on order status changes
- **enqueueTemplateEmail** — order confirmation, shipping notification emails

## Product Types

| Type | Description |
|------|-------------|
| `simple` | Single product, fixed price, optional inventory |
| `variable` | Product with variants (size/color), each with own price + stock |
| `digital` | Downloadable product with token-based download links |
| `subscription` | Recurring product, delegates to core-billing subscription system |

## Cart System

- **Logged in:** Server-side cart in DB, persists across devices
- **Anonymous:** Client passes `sessionId` (from cookie), stored in DB
- **Merge on login:** `storeCart.merge` moves anonymous items into user cart

## EU Compliance

- Tax rates per country + tax class (standard, reduced, zero)
- `priceIncludesTax` flag (EU = true, US = false)
- Reverse charge for B2B with valid VAT ID
- Sequential invoice numbers (INV-YYYY-XXXXX)
- Tax breakdown stored per order item + per order

## Wiring Into a Project

1. **Deps:** Copy `_templates/config/store-deps.ts` → `src/config/store-deps.ts`, import in server.ts
2. **Config:** Add to `indigo.config.ts`, run `bun run indigo:sync`
3. **Migrate:** `bun run db:generate && bun run db:migrate`
4. **Seed:** Add shipping zones + tax rates (EU VAT) via admin or seed script
5. **Webhook:** Handle payment completion webhook → call `updateOrderStatus('processing')`
6. **Pages:** Build storefront pages (product list, detail, cart, checkout, order history)

## Dependencies

- **core-billing** — required for payment processing (uses `getProvider` for Stripe/crypto checkout)
