# core-store — CLAUDE.md

E-commerce — products, variants, cart, checkout, orders, shipping, tax (EU VAT compliant).

## Module Boundary

**core-store owns:** Product/variant/category/cart/order/invoice/shipping/tax schema, all routers, cart/tax/shipping/order services.

**Project owns:** Admin pages, storefront pages, `config/store-deps.ts`, payment webhook handler.

## DI (`setStoreDeps()`)

`createPaymentCheckout` (via core-payments), `sendNotification`, `enqueueTemplateEmail`.

## Product Types

`simple` (fixed price), `variable` (variants with own price/stock), `digital` (token-based downloads), `subscription` (delegates to core-subscriptions).

## Cart

Logged in = server-side DB cart. Anonymous = `sessionId` cookie → DB. Merge on login via `storeCart.merge`.

## EU Compliance

Tax rates per country + tax class. `priceIncludesTax` flag (EU=true, US=false). Reverse charge for B2B with valid VAT ID. Sequential invoice numbers (INV-YYYY-XXXXX). Tax breakdown stored per order item.

**Requires** core-payments for checkout.
