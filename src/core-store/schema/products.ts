import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const productTypeEnum = pgEnum('store_product_type', ['simple', 'variable', 'digital', 'subscription']);
export const productStatusEnum = pgEnum('store_product_status', ['draft', 'published', 'archived']);

// ─── Products ───────────────────────────────────────────────────────────────

export const storeProducts = pgTable('store_products', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: productTypeEnum('type').notNull().default('simple'),
  status: productStatusEnum('status').notNull().default('draft'),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  shortDescription: varchar('short_description', { length: 500 }),
  /** Price in cents (for simple/digital). Variable products use variant prices. */
  priceCents: integer('price_cents'),
  /** Compare-at / original price in cents (for showing discounts) */
  comparePriceCents: integer('compare_price_cents'),
  currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
  /** SKU for simple products. Variants have their own SKUs. */
  sku: varchar('sku', { length: 100 }),
  /** Inventory tracking */
  trackInventory: boolean('track_inventory').notNull().default(false),
  stockQuantity: integer('stock_quantity').default(0),
  lowStockThreshold: integer('low_stock_threshold').default(5),
  allowBackorders: boolean('allow_backorders').notNull().default(false),
  /** Weight in grams (for shipping calculation) */
  weightGrams: integer('weight_grams'),
  /** For digital products */
  digitalFileUrl: text('digital_file_url'),
  downloadLimit: integer('download_limit'),
  /** For subscription products — references core-billing plan */
  subscriptionPlanId: varchar('subscription_plan_id', { length: 100 }),
  /** SEO */
  metaTitle: varchar('meta_title', { length: 255 }),
  metaDescription: varchar('meta_description', { length: 500 }),
  /** Featured image URL */
  featuredImage: text('featured_image'),
  /** Tax class (standard, reduced, zero) */
  taxClass: varchar('tax_class', { length: 50 }).notNull().default('standard'),
  /** Whether shipping is required */
  requiresShipping: boolean('requires_shipping').notNull().default(true),
  /** Sort order */
  sortOrder: integer('sort_order').notNull().default(0),
  /** Flexible metadata */
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
}, (table) => [
  index('idx_store_products_slug').on(table.slug),
  index('idx_store_products_status').on(table.status),
  index('idx_store_products_type').on(table.type),
  index('idx_store_products_deleted').on(table.deletedAt),
]);

// ─── Variant Options (Size, Color, Material) ───────────────────────────────

export const storeVariantGroups = pgTable('store_variant_groups', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull().references(() => storeProducts.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(), // "Size", "Color"
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  index('idx_store_variant_groups_product').on(table.productId),
]);

// ─── Product Variants (S/Red, M/Blue, etc.) ────────────────────────────────

export const storeProductVariants = pgTable('store_product_variants', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull().references(() => storeProducts.id, { onDelete: 'cascade' }),
  /** Combination label e.g. "S / Red" */
  name: varchar('name', { length: 255 }).notNull(),
  sku: varchar('sku', { length: 100 }),
  priceCents: integer('price_cents').notNull(),
  comparePriceCents: integer('compare_price_cents'),
  stockQuantity: integer('stock_quantity').default(0),
  weightGrams: integer('weight_grams'),
  /** JSON of option values: { "Size": "S", "Color": "Red" } */
  options: jsonb('options').notNull(),
  image: text('image'),
  isDefault: boolean('is_default').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_store_variants_product').on(table.productId),
  index('idx_store_variants_sku').on(table.sku),
]);

// ─── Product Images (gallery) ──────────────────────────────────────────────

export const storeProductImages = pgTable('store_product_images', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull().references(() => storeProducts.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  alt: varchar('alt', { length: 255 }),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  index('idx_store_product_images_product').on(table.productId),
]);

// ─── Product Categories ────────────────────────────────────────────────────

export const storeCategories = pgTable('store_categories', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  parentId: text('parent_id'),
  image: text('image'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_store_categories_slug').on(table.slug),
  index('idx_store_categories_parent').on(table.parentId),
]);

export const storeProductCategories = pgTable('store_product_categories', {
  productId: text('product_id').notNull().references(() => storeProducts.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').notNull().references(() => storeCategories.id, { onDelete: 'cascade' }),
}, (table) => [
  index('idx_store_product_categories_product').on(table.productId),
  index('idx_store_product_categories_category').on(table.categoryId),
]);
