/**
 * core-store module registration entrypoint.
 */

// ─── Routers ──────────────────────────────────────────────────────────────────

export { storeProductsRouter } from './routers/products';
export { storeCartRouter } from './routers/cart';
export { storeCheckoutRouter } from './routers/checkout';
export { storeOrdersRouter } from './routers/orders';
export { storeAdminOrdersRouter } from './routers/admin-orders';
export { storeWishlistRouter } from './routers/wishlists';
export { storeDiscountsRouter } from './routers/discounts';
export { storeReviewsRouter } from './routers/reviews';
export { storeRelationsRouter } from './routers/relations';
export { storeAttributesRouter } from './routers/attributes';

// ─── Schema ───────────────────────────────────────────────────────────────────

export * from './schema/products';
export * from './schema/orders';
export * from './schema/shipping-tax';
export * from './schema/wishlists';
export * from './schema/discount-codes';
export * from './schema/reviews';
export * from './schema/relations';
export * from './schema/attributes';

// ─── Services ─────────────────────────────────────────────────────────────────

export { calculateTax, calculateOrderTax } from './lib/tax-service';
export type { TaxCalculation } from './lib/tax-service';
export { getShippingOptions } from './lib/shipping-service';
export type { ShippingOption } from './lib/shipping-service';
export { getOrCreateCart, getCartWithItems, mergeCart } from './lib/cart-service';
export type { CartWithItems, CartItemDetail } from './lib/cart-service';
export { createOrder, updateOrderStatus, assignInvoiceNumber } from './lib/order-service';
export type { BillingProfileSnapshot } from './types/billing';
export type { CreateOrderParams } from './lib/order-service';
export { validateDiscount, recordDiscountUsage } from './lib/discount-service';
export type { DiscountResult } from './lib/discount-service';
export { sendOrderStatusNotification } from './lib/order-notifications';
export { checkLowStock } from './lib/inventory-alerts';
export { generateInvoiceHtml } from './lib/invoice-template';
export { setRefundHandler, getRefundHandler } from './lib/refund-types';
export type { RefundHandler } from './lib/refund-types';

// ─── Totals pipeline ─────────────────────────────────────────────────────────

export { registerTotalsCollector, calculateTotalsPipeline } from './lib/totals-pipeline';
export type { TotalsCollector, TotalsContext, TotalsResult, TotalAdjustment } from './lib/totals-pipeline';

// ─── Webhook handler ──────────────────────────────────────────────────────────

export { handleStorePaymentEvent } from './lib/webhook-handler';
export type { StoreWebhookEventData } from './lib/webhook-handler';

// ─── Dependencies ─────────────────────────────────────────────────────────────

export { setStoreDeps, getStoreDeps } from './deps';
export type { StoreDeps } from './deps';

// ─── Side-effect imports (self-registering modules) ───────────────────────────

import './lib/abandoned-cart'; // registers maintenance task for cart recovery emails
