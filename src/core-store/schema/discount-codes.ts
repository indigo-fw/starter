import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

// ─── Discount Codes ───────────────────────────────────────────────────────

export const storeDiscountCodes = pgTable('store_discount_codes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** The coupon code (stored uppercase, matched case-insensitively) */
  code: varchar('code', { length: 50 }).notNull().unique(),
  /** 'percentage' or 'fixed_amount' */
  type: varchar('type', { length: 20 }).notNull(),
  /** Percentage (e.g. 10 for 10%) or fixed amount in cents */
  value: integer('value').notNull(),
  /** Currency — only relevant for fixed_amount discounts */
  currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
  /** Minimum order subtotal (in cents) required to apply this code */
  minOrderCents: integer('min_order_cents'),
  /** Maximum discount in cents (cap for percentage discounts) */
  maxDiscountCents: integer('max_discount_cents'),
  /** Total number of times this code can be used (null = unlimited) */
  maxUses: integer('max_uses'),
  /** How many times this code has been used */
  usedCount: integer('used_count').notNull().default(0),
  /** Per-user usage limit (null = unlimited) */
  maxUsesPerUser: integer('max_uses_per_user'),
  /** When the code becomes active (null = immediately) */
  startsAt: timestamp('starts_at'),
  /** When the code expires (null = never) */
  expiresAt: timestamp('expires_at'),
  /** Whether the code is active (soft-delete by setting false) */
  isActive: boolean('is_active').notNull().default(true),
  /** Array of category IDs this discount applies to (null = all products) */
  appliesToCategories: jsonb('applies_to_categories').$type<string[]>(),
  /** Array of product IDs this discount applies to (null = all products) */
  appliesToProducts: jsonb('applies_to_products').$type<string[]>(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_store_discount_codes_code').on(table.code),
  index('idx_store_discount_codes_active').on(table.isActive),
]);

// ─── Discount Usage (per-user tracking) ───────────────────────────────────

export const storeDiscountUsage = pgTable('store_discount_usage', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  discountCodeId: text('discount_code_id')
    .notNull()
    .references(() => storeDiscountCodes.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  orderId: text('order_id').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_store_discount_usage_code_user').on(table.discountCodeId, table.userId),
]);
