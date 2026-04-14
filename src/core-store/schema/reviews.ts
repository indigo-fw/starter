import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { storeProducts } from './products';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const reviewStatusEnum = pgEnum('store_review_status', ['pending', 'approved', 'rejected']);

// ─── Reviews ────────────────────────────────────────────────────────────────

export const storeReviews = pgTable('store_reviews', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull().references(() => storeProducts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  rating: integer('rating').notNull(),
  title: varchar('title', { length: 255 }),
  body: text('body'),
  status: reviewStatusEnum('status').notNull().default('pending'),
  verifiedPurchase: boolean('verified_purchase').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_store_reviews_product_user').on(table.productId, table.userId),
  index('idx_store_reviews_product').on(table.productId),
  index('idx_store_reviews_user').on(table.userId),
  index('idx_store_reviews_status').on(table.status),
  index('idx_store_reviews_product_status').on(table.productId, table.status),
]);
