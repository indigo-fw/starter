import { index, integer, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { storeProducts } from './products';

// ─── Related / Upsell / Cross-sell Products ───────────────────────────────

export const storeRelatedProducts = pgTable('store_related_products', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id')
    .notNull()
    .references(() => storeProducts.id, { onDelete: 'cascade' }),
  relatedProductId: text('related_product_id')
    .notNull()
    .references(() => storeProducts.id, { onDelete: 'cascade' }),
  /** 'related' | 'upsell' | 'crosssell' */
  type: varchar('type', { length: 20 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_store_related_product').on(table.productId),
  index('idx_store_related_related').on(table.relatedProductId),
  uniqueIndex('idx_store_related_unique').on(table.productId, table.relatedProductId, table.type),
]);
