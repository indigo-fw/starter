import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { storeProducts } from './products';

// ─── Wishlists ─────────────────────────────────────────────────────────────

export const storeWishlists = pgTable('store_wishlists', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  productId: text('product_id').notNull().references(() => storeProducts.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_store_wishlists_user_product').on(table.userId, table.productId),
  index('idx_store_wishlists_user').on(table.userId),
  index('idx_store_wishlists_product').on(table.productId),
]);
