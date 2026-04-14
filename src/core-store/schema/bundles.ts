import { index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { storeProducts, storeProductVariants } from './products';

// ─── Bundle Items ─────────────────────────────────────────────────────────

export const storeBundleItems = pgTable('store_bundle_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bundleProductId: text('bundle_product_id').notNull().references(() => storeProducts.id, { onDelete: 'cascade' }),
  componentProductId: text('component_product_id').notNull().references(() => storeProducts.id, { onDelete: 'cascade' }),
  componentVariantId: text('component_variant_id').references(() => storeProductVariants.id, { onDelete: 'set null' }),
  quantity: integer('quantity').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  index('idx_store_bundle_items_bundle').on(table.bundleProductId),
]);
