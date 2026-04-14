import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { storeProducts, storeProductVariants } from './products';

// ─── Inventory Reservations ───────────────────────────────────────────────

export const storeInventoryReservations = pgTable('store_inventory_reservations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull().references(() => storeProducts.id, { onDelete: 'cascade' }),
  variantId: text('variant_id').references(() => storeProductVariants.id, { onDelete: 'cascade' }),
  /** Cart ID — no FK because carts may be deleted independently */
  cartId: text('cart_id').notNull(),
  quantity: integer('quantity').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_store_inv_reservations_product_variant').on(table.productId, table.variantId),
  index('idx_store_inv_reservations_cart').on(table.cartId),
  index('idx_store_inv_reservations_expires').on(table.expiresAt),
]);
