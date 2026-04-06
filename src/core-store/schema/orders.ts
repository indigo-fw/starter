import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { storeProducts, storeProductVariants } from './products';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const orderStatusEnum = pgEnum('store_order_status', [
  'pending',      // created, awaiting payment
  'processing',   // paid, being prepared
  'shipped',      // shipped, in transit
  'delivered',    // delivered to customer
  'cancelled',    // cancelled by customer or admin
  'refunded',     // fully refunded
]);

// ─── Customer Addresses ────────────────────────────────────────────────────

export const storeAddresses = pgTable('store_addresses', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  type: varchar('type', { length: 20 }).notNull().default('shipping'), // shipping | billing
  isDefault: boolean('is_default').notNull().default(false),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  company: varchar('company', { length: 255 }),
  address1: varchar('address_1', { length: 255 }).notNull(),
  address2: varchar('address_2', { length: 255 }),
  city: varchar('city', { length: 100 }).notNull(),
  state: varchar('state', { length: 100 }),
  postalCode: varchar('postal_code', { length: 20 }).notNull(),
  country: varchar('country', { length: 2 }).notNull(), // ISO 3166-1 alpha-2
  phone: varchar('phone', { length: 30 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('idx_store_addresses_user').on(table.userId, table.type),
]);

// ─── Cart (server-side, for logged-in users) ───────────────────────────────

export const storeCarts = pgTable('store_carts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id'),
  /** Anonymous cart ID (from cookie) */
  sessionId: varchar('session_id', { length: 100 }),
  currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('idx_store_carts_user').on(table.userId),
  index('idx_store_carts_session').on(table.sessionId),
]);

export const storeCartItems = pgTable('store_cart_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  cartId: text('cart_id').notNull().references(() => storeCarts.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => storeProducts.id),
  variantId: text('variant_id').references(() => storeProductVariants.id),
  quantity: integer('quantity').notNull().default(1),
  /** Price at time of adding (snapshot, in cents) */
  unitPriceCents: integer('unit_price_cents').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_store_cart_items_cart').on(table.cartId),
]);

// ─── Orders ────────────────────────────────────────────────────────────────

export const storeOrders = pgTable('store_orders', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** Human-readable order number (auto-increment or custom) */
  orderNumber: varchar('order_number', { length: 50 }).notNull().unique(),
  userId: text('user_id').notNull(),
  organizationId: text('organization_id'),
  status: orderStatusEnum('status').notNull().default('pending'),
  currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
  /** Totals in cents */
  subtotalCents: integer('subtotal_cents').notNull(),
  shippingCents: integer('shipping_cents').notNull().default(0),
  taxCents: integer('tax_cents').notNull().default(0),
  discountCents: integer('discount_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  /** Payment */
  paymentProviderId: varchar('payment_provider_id', { length: 50 }),
  paymentTransactionId: text('payment_transaction_id'),
  paidAt: timestamp('paid_at'),
  /** Shipping address snapshot (JSON, not FK — immutable after order) */
  shippingAddress: jsonb('shipping_address'),
  /** Billing address snapshot */
  billingAddress: jsonb('billing_address'),
  /** Shipping */
  shippingMethod: varchar('shipping_method', { length: 100 }),
  trackingNumber: varchar('tracking_number', { length: 255 }),
  trackingUrl: text('tracking_url'),
  shippedAt: timestamp('shipped_at'),
  deliveredAt: timestamp('delivered_at'),
  /** Discount code used */
  discountCode: varchar('discount_code', { length: 50 }),
  /** Customer note */
  customerNote: text('customer_note'),
  /** Admin note (internal) */
  adminNote: text('admin_note'),
  /** Invoice number (for EU compliance) */
  invoiceNumber: varchar('invoice_number', { length: 50 }),
  /** Tax details snapshot for invoice */
  taxDetails: jsonb('tax_details'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  cancelledAt: timestamp('cancelled_at'),
  refundedAt: timestamp('refunded_at'),
}, (table) => [
  index('idx_store_orders_user').on(table.userId),
  index('idx_store_orders_status').on(table.status),
  index('idx_store_orders_number').on(table.orderNumber),
  index('idx_store_orders_created').on(table.createdAt),
]);

// ─── Order Line Items ──────────────────────────────────────────────────────

export const storeOrderItems = pgTable('store_order_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  orderId: text('order_id').notNull().references(() => storeOrders.id, { onDelete: 'cascade' }),
  productId: text('product_id'),
  variantId: text('variant_id'),
  /** Snapshot fields (immutable — product may change after order) */
  productName: varchar('product_name', { length: 255 }).notNull(),
  variantName: varchar('variant_name', { length: 255 }),
  sku: varchar('sku', { length: 100 }),
  quantity: integer('quantity').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  totalCents: integer('total_cents').notNull(),
  taxCents: integer('tax_cents').notNull().default(0),
  taxRate: varchar('tax_rate', { length: 10 }),
  /** For digital products */
  isDigital: boolean('is_digital').notNull().default(false),
  digitalFileUrl: text('digital_file_url'),
  image: text('image'),
  metadata: jsonb('metadata'),
}, (table) => [
  index('idx_store_order_items_order').on(table.orderId),
]);

// ─── Order Events (status history) ─────────────────────────────────────────

export const storeOrderEvents = pgTable('store_order_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  orderId: text('order_id').notNull().references(() => storeOrders.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 30 }).notNull(),
  note: text('note'),
  /** Who triggered: userId or 'system' */
  actor: varchar('actor', { length: 100 }).notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_store_order_events_order').on(table.orderId, table.createdAt),
]);

// ─── Digital Downloads ─────────────────────────────────────────────────────

export const storeDownloads = pgTable('store_downloads', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  orderId: text('order_id').notNull().references(() => storeOrders.id, { onDelete: 'cascade' }),
  orderItemId: text('order_item_id').notNull().references(() => storeOrderItems.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  /** Unique download token (used in download URL) */
  token: varchar('token', { length: 100 }).notNull().unique(),
  fileUrl: text('file_url').notNull(),
  downloadCount: integer('download_count').notNull().default(0),
  downloadLimit: integer('download_limit'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_store_downloads_token').on(table.token),
  index('idx_store_downloads_user').on(table.userId),
]);
