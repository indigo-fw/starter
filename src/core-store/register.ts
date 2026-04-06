/**
 * core-store module registration entrypoint.
 */

// Routers
export { storeProductsRouter } from './routers/products';
export { storeCartRouter } from './routers/cart';
export { storeCheckoutRouter } from './routers/checkout';
export { storeOrdersRouter } from './routers/orders';

// Schema
export * from './schema/products';
export * from './schema/orders';
export * from './schema/shipping-tax';

// Services
export { calculateTax, calculateOrderTax } from './lib/tax-service';
export type { TaxCalculation } from './lib/tax-service';
export { getShippingOptions } from './lib/shipping-service';
export type { ShippingOption } from './lib/shipping-service';
export { getOrCreateCart, getCartWithItems, mergeCart } from './lib/cart-service';
export type { CartWithItems, CartItemDetail } from './lib/cart-service';
export { createOrder, updateOrderStatus, assignInvoiceNumber } from './lib/order-service';

// Dependencies
export { setStoreDeps, getStoreDeps } from './deps';
export type { StoreDeps } from './deps';
