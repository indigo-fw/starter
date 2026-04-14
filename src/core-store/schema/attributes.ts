import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { storeProducts } from './products';

// ─── Product Attributes (Material, Brand, Color, etc.) ────────────────────

export const storeAttributes = pgTable('store_attributes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** Display name: "Material", "Brand", "Color" */
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  /** 'select' = predefined values, 'text' = freeform, 'number' = numeric */
  type: varchar('type', { length: 20 }).notNull().default('select'),
  /** For 'select' type: array of allowed values ["Cotton", "Polyester", "Wool"] */
  values: jsonb('values').$type<string[]>(),
  /** Whether this attribute appears in storefront faceted filters */
  filterable: boolean('filterable').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_store_attributes_slug').on(table.slug),
]);

// ─── Product ↔ Attribute Values ───────────────────────────────────────────

export const storeProductAttributeValues = pgTable('store_product_attribute_values', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id')
    .notNull()
    .references(() => storeProducts.id, { onDelete: 'cascade' }),
  attributeId: text('attribute_id')
    .notNull()
    .references(() => storeAttributes.id, { onDelete: 'cascade' }),
  /** The actual value for this product, e.g. "Cotton" */
  value: varchar('value', { length: 255 }).notNull(),
}, (table) => [
  uniqueIndex('idx_store_pav_product_attribute').on(table.productId, table.attributeId),
  index('idx_store_pav_product').on(table.productId),
  index('idx_store_pav_attribute_value').on(table.attributeId, table.value),
]);
