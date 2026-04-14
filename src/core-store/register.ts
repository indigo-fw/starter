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
export { storeAddressesRouter } from './routers/addresses';
export { storeAnalyticsRouter } from './routers/analytics';
export { storeFulfillmentRouter } from './routers/fulfillment';
export { storeReturnsRouter } from './routers/returns';
export { storeAlertsRouter } from './routers/alerts';
export { storeAdminRouter } from './routers/store-admin';

// ─── Schema ───────────────────────────────────────────────────────────────────

export * from './schema/products';
export * from './schema/orders';
export * from './schema/shipping-tax';
export * from './schema/wishlists';
export * from './schema/discount-codes';
export * from './schema/reviews';
export * from './schema/relations';
export * from './schema/attributes';
export * from './schema/currency';
export * from './schema/inventory';
export * from './schema/fulfillment';
export * from './schema/returns';
export * from './schema/bundles';
export * from './schema/alerts';

// ─── Services ─────────────────────────────────────────────────────────────────

export { calculateTax, calculateOrderTax } from './lib/tax-service';
export type { TaxCalculation } from './lib/tax-service';
export { getShippingOptions } from './lib/shipping-service';
export type { ShippingOption } from './lib/shipping-service';
export { getOrCreateCart, getCartWithItems, mergeCart } from './lib/cart-service';
export type { CartWithItems, CartItemDetail } from './lib/cart-service';
export { createOrder, updateOrderStatus, assignInvoiceNumber, deductOrderInventory, restoreOrderInventory } from './lib/order-service';
export type { BillingProfileSnapshot } from './types/billing';
export type { CreateOrderParams } from './lib/order-service';
export { validateDiscount, recordDiscountUsage } from './lib/discount-service';
export type { DiscountResult } from './lib/discount-service';
export { sendOrderStatusNotification } from './lib/order-notifications';
export { checkLowStock } from './lib/inventory-alerts';
export { convertCurrency, getExchangeRates } from './lib/currency-service';
export { generateInvoiceHtml } from './lib/invoice-template';
export { setRefundHandler, getRefundHandler } from './lib/refund-types';
export type { RefundHandler } from './lib/refund-types';
export { reserveStock, releaseCartReservations, getAvailableStock, convertReservationsToDeduction, RESERVATION_TTL_MINUTES } from './lib/reservation-service';
export { createShipment, updateShipmentStatus, getOrderShipments, getUnfulfilledItems, generatePackingSlip } from './lib/fulfillment-service';
export { createReturn, approveReturn, receiveReturn, processReturnRefund, rejectReturn, getOrderReturns } from './lib/return-service';
export { getBundleComponents, checkBundleAvailability, calculateBundlePrice, deductBundleInventory, restoreBundleInventory } from './lib/bundle-service';
export { subscribe as subscribeBackInStock, unsubscribe as unsubscribeBackInStock, notifySubscribers } from './lib/back-in-stock-service';
export { getStoreStats, getTaxReport } from './lib/store-stats';
export type { StoreStats, TaxReportRow } from './lib/store-stats';
export { getAutoApplyDiscounts } from './lib/discount-service';
export { editOrder, reorderFromOrder } from './lib/order-service';

// ─── Totals pipeline ─────────────────────────────────────────────────────────

export { registerTotalsCollector, calculateTotalsPipeline } from './lib/totals-pipeline';
export type { TotalsCollector, TotalsContext, TotalsResult, TotalAdjustment } from './lib/totals-pipeline';

// ─── Webhook handler ──────────────────────────────────────────────────────────

export { handleStorePaymentEvent } from './lib/webhook-handler';
export type { StoreWebhookEventData } from './lib/webhook-handler';

// ─── SEO ─────────────────────────────────────────────────────────────────────

export { buildProductJsonLd } from './lib/product-json-ld';
export type { ProductJsonLdInput } from './lib/product-json-ld';
export { buildStoreBreadcrumbJsonLd } from './lib/json-ld';

// ─── Dependencies ─────────────────────────────────────────────────────────────

export { setStoreDeps, getStoreDeps } from './deps';
export type { StoreDeps } from './deps';

// ─── Side-effect imports (self-registering modules) ───────────────────────────

import './lib/abandoned-cart'; // registers maintenance task for cart recovery emails
import './lib/reservation-service'; // registers maintenance task for expired reservation cleanup
import './lib/review-request-service'; // registers maintenance task for post-purchase review prompts
import './lib/discount-service'; // registers auto-discount totals pipeline collector
