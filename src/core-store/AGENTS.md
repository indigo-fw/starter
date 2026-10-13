# core-store — AGENTS.md

E-commerce module — products, variants, cart, checkout, orders, shipping, tax, wishlists, reviews, discounts, attributes, invoices, refunds.

**Project owns:** Storefront pages, admin pages, `config/deps/store-deps.ts`, payment webhook handler.

## DI

`setStoreDeps()` — `createPaymentCheckout`, `resolveOrgId`, `getBillingProfile`, `sendNotification`, `enqueueTemplateEmail`, optional `createSubscriptionCheckout`.

`setRefundHandler()` — optional payment refund handler (Stripe refund, etc.).

## Product Types

Live enum: `productTypeEnum` in `schema/products.ts`. Non-obvious: `digital` delivers via token-based download links; `subscription` delegates checkout to core-subscriptions.

## Checkout

Totals pipeline: subtotal → discount → shipping → tax. Discount codes are validated server-side during checkout (per-user + global limits, expiry, min order, targeting). `placeOrder` creates the order **and assigns the sequential invoice number before payment** — the order exists pre-pay, then redirects to the payment provider. The pipeline is pluggable (`registerTotalsCollector`, sortOrder gaps at 95–199); authenticated checkout seeds `ctx.extensions` with `userId` + `orgId` so collectors can consult entitlements — e.g. the member discount in `config/store-pricing.ts` (project-owned) reads `plan.features.storeDiscountPercent` and discounts subscribers' orders. Guest checkout (`guestPlaceOrder`) has no orgId → entitlement collectors no-op.

## Non-Obvious Semantics

- **Cart** — server-side DB. Anonymous via `sessionId` cookie, logged-in via `userId`; anonymous cart merges into the user cart on login.
- **Wishlists** — use `checkMany` for batch heart-state on product grids (avoids N+1).
- **Reviews** — verified-purchase detection; moderation queue (pending/approved/rejected).
- **Related products** — admin-configured relations (related/upsell/crosssell); falls back to category-based when none configured.
- **Inventory** — `checkLowStock()` runs after every inventory deduction; warns at threshold.
- **Abandoned carts** — daily maintenance task: 24h+ idle carts with items, logged-in users only; reminder email deduped via a cart metadata flag.
- **Refunds** — every path is claim → gateway → commit (`lib/refund-service.ts` is the shared plumbing; `store_orders.refundedCents` is the single ledger, bumped only under `refundedCents + amount <= totalCents`). Returns claim `approved|received → refunding` (CAS) **before** the `RefundHandler` call; whole-order `refundOrder` claims by flipping the order status itself (CAS on paid status + prior `refundedCents`) and refunds `total − refunded`; the `payment.refunded` webhook settles `refundedCents = totalCents` in one `WHERE status <> 'refunded'` update. A handler **throw** = unknown outcome → claim kept, never auto-retried (returns: `resolveStuckRefund` is the audited ops exit; orders: fix the counter by hand); `status: 'failed'` = definitive decline → claim rolled back. `approveReturn` caps at `total − refunded − other pending returns`. Order becomes `refunded` only when `refundedCents == totalCents`, else `partially_refunded`. `receiveReturn`/`rejectReturn` refuse once a refund is in flight or done.
- **Invoices** — print-ready HTML with EU tax breakdown; PDF via browser print.

## EU Compliance

Tax rates per country + tax class. `priceIncludesTax` (EU=true, US=false). Reverse charge for B2B. Sequential invoice numbers (INV-YYYY-XXXXX). Tax breakdown per order item.
