import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { storeProducts, storeProductVariants } from './products';

// ─── Back-in-Stock Alerts ─────────────────────────────────────────────────

export const storeBackInStockAlerts = pgTable('store_back_in_stock_alerts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  productId: text('product_id').notNull().references(() => storeProducts.id, { onDelete: 'cascade' }),
  variantId: text('variant_id').references(() => storeProductVariants.id, { onDelete: 'cascade' }),
  notifiedAt: timestamp('notified_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_store_back_in_stock_product_variant').on(table.productId, table.variantId),
  index('idx_store_back_in_stock_user').on(table.userId),
  uniqueIndex('idx_store_back_in_stock_unique').on(table.userId, table.productId, table.variantId),
]);
