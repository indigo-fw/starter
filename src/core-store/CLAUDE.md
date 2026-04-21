# core-store — CLAUDE.md

E-commerce module — products, variants, cart, checkout, orders, shipping, tax, wishlists, reviews, discounts, attributes, invoices, refunds.

## Module Boundary

**core-store owns:** All store schema (8 files), 10 tRPC routers, services (cart, tax, shipping, orders, discounts, notifications, inventory, abandoned cart, invoices), components (CartWidget, AddToCartForm, VariantSelector, ProductGallery, WishlistButton, StarRating, ReviewForm).

**Project owns:** Storefront pages, admin pages, `config/deps/store-deps.ts`, payment webhook handler.

## DI

`setStoreDeps()` — `createPaymentCheckout`, `resolveOrgId`, `getBillingProfile`, `sendNotification`, `enqueueTemplateEmail`, optional `createSubscriptionCheckout`.

`setRefundHandler()` — optional payment refund handler (Stripe refund, etc.).

## Routers (10)

| Key | File | Scope |
|-----|------|-------|
| `storeProducts` | products.ts | Public list/detail + admin CRUD, variants, categories |
| `storeCart` | cart.ts | Public cart (anonymous + authenticated) |
| `storeCheckout` | checkout.ts | Protected — shipping options, totals preview, place order |
| `storeOrders` | orders.ts | Customer order history + admin order management |
| `storeAdminOrders` | admin-orders.ts | Admin — export, refund, invoice generation |
| `storeWishlist` | wishlists.ts | Protected — toggle, list, check, checkMany |
| `storeDiscounts` | discounts.ts | Admin CRUD + public validate |
| `storeReviews` | reviews.ts | Public list/ratings + protected create + admin moderate |
| `storeRelations` | relations.ts | Public getRelated + admin set/get |
| `storeAttributes` | attributes.ts | Public filterable list + admin CRUD |

## Schema (8 files)

`products` (products, variants, variant groups, images, categories), `orders` (orders, items, events, downloads, carts, cart items, addresses), `shipping-tax` (zones, rates, tax rates, settings), `wishlists`, `discount-codes` (codes + usage tracking), `reviews`, `relations` (related/upsell/crosssell), `attributes` (definitions + product values).

## Product Types

`simple` (fixed price), `variable` (variants with own price/stock), `digital` (token-based downloads), `subscription` (delegates to core-subscriptions).

## Key Features

**Cart** — Server-side DB. Anonymous via `sessionId` cookie, logged-in via `userId`. Merge on login.

**Checkout** — Totals pipeline: subtotal → discount → shipping → tax. Supports discount codes server-side. Creates order, assigns EU invoice number, redirects to payment.

**Wishlists** — Heart toggle on products. `checkMany` for batch state on grids. Paginated list.

**Discount Codes** — Percentage or fixed amount. Per-user limits, global limits, expiry, min order, category/product targeting. Validated server-side during checkout.

**Reviews** — 1-5 star ratings. Verified purchase detection. Moderation queue (pending/approved/rejected). Batch ratings query for product grids. Rating distribution bars.

**Product Attributes** — Filterable attributes (Material, Brand, etc.) with faceted listing. Admin CRUD.

**Related Products** — Admin-configured relations (related/upsell/crosssell). Falls back to category-based if no relations configured.

**Order Notifications** — Status change emails (processing, shipped, delivered, cancelled, refunded). In-app notifications via `sendNotification`.

**Inventory Alerts** — `checkLowStock()` called after every inventory deduction. Logs warnings at threshold.

**Abandoned Cart Recovery** — Daily maintenance task. Finds 24h+ idle carts with items for logged-in users. Sends reminder email. Dedup via cart metadata flag.

**Order Export** — TSV/JSON export with date/status filters (admin).

**Refunds** — Admin refund flow. Updates status + optional payment refund via pluggable `RefundHandler`.

**PDF Invoices** — Print-ready HTML invoice generation. EU-compliant with tax breakdown. Browser print-to-PDF.

## EU Compliance

Tax rates per country + tax class. `priceIncludesTax` (EU=true, US=false). Reverse charge for B2B. Sequential invoice numbers (INV-YYYY-XXXXX). Tax breakdown per order item.

## Requires

`core-payments` for checkout. Optional: `core-subscriptions` for subscription products.
