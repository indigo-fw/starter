import { index, integer, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { storeOrders, storeOrderItems } from './orders';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const shipmentStatusEnum = pgEnum('store_shipment_status', ['pending', 'shipped', 'delivered']);

// ─── Shipments ────────────────────────────────────────────────────────────

export const storeShipments = pgTable('store_shipments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  orderId: text('order_id').notNull().references(() => storeOrders.id, { onDelete: 'cascade' }),
  status: shipmentStatusEnum('status').notNull().default('pending'),
  trackingNumber: varchar('tracking_number', { length: 255 }),
  trackingUrl: text('tracking_url'),
  carrier: varchar('carrier', { length: 100 }),
  shippingMethod: varchar('shipping_method', { length: 100 }),
  note: text('note'),
  shippedAt: timestamp('shipped_at'),
  deliveredAt: timestamp('delivered_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_store_shipments_order').on(table.orderId),
  index('idx_store_shipments_status').on(table.status),
]);

// ─── Shipment Items ───────────────────────────────────────────────────────

export const storeShipmentItems = pgTable('store_shipment_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  shipmentId: text('shipment_id').notNull().references(() => storeShipments.id, { onDelete: 'cascade' }),
  orderItemId: text('order_item_id').notNull().references(() => storeOrderItems.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull(),
}, (table) => [
  index('idx_store_shipment_items_shipment').on(table.shipmentId),
  index('idx_store_shipment_items_order_item').on(table.orderItemId),
]);
