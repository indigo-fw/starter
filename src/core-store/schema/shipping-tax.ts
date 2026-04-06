import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ─── Shipping Zones ────────────────────────────────────────────────────────

export const storeShippingZones = pgTable('store_shipping_zones', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar('name', { length: 255 }).notNull(),
  /** Countries in this zone (ISO 3166-1 alpha-2 codes) */
  countries: jsonb('countries').notNull().$type<string[]>(),
  /** Optional: specific regions/states within countries */
  regions: jsonb('regions').$type<string[]>(),
  isDefault: boolean('is_default').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── Shipping Rates ────────────────────────────────────────────────────────

export const storeShippingRates = pgTable('store_shipping_rates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  zoneId: text('zone_id').notNull().references(() => storeShippingZones.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(), // "Standard", "Express"
  /** Flat rate in cents */
  rateCents: integer('rate_cents').notNull(),
  /** Free shipping above this order total (cents). Null = no free shipping. */
  freeAboveCents: integer('free_above_cents'),
  /** Additional per-item rate (cents). For weight-based or per-item shipping. */
  perItemCents: integer('per_item_cents').default(0),
  /** Min/max weight in grams for this rate. Null = no weight restriction. */
  minWeightGrams: integer('min_weight_grams'),
  maxWeightGrams: integer('max_weight_grams'),
  /** Estimated delivery time */
  estimatedDays: varchar('estimated_days', { length: 50 }), // "3-5", "1-2"
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_store_shipping_rates_zone').on(table.zoneId),
]);

// ─── Tax Rates (EU VAT compliant) ─────────────────────────────────────────

export const storeTaxRates = pgTable('store_tax_rates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** Country (ISO 3166-1 alpha-2) */
  country: varchar('country', { length: 2 }).notNull(),
  /** State/region (optional, for country-specific rates like US states) */
  state: varchar('state', { length: 100 }),
  /** Tax class this rate applies to */
  taxClass: varchar('tax_class', { length: 50 }).notNull().default('standard'),
  /** Tax rate as percentage (e.g. 21.00 for 21% VAT) */
  rate: numeric('rate', { precision: 5, scale: 2 }).notNull(),
  /** Display name (e.g. "VAT", "Sales Tax", "BTW") */
  name: varchar('name', { length: 100 }).notNull(),
  /** Whether price includes tax (EU = true, US = false typically) */
  priceIncludesTax: boolean('price_includes_tax').notNull().default(true),
  /** EU reverse charge applies (B2B with valid VAT ID) */
  reverseCharge: boolean('reverse_charge').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_store_tax_rates_country').on(table.country, table.taxClass),
]);

// ─── Store Settings ────────────────────────────────────────────────────────

export const storeSettings = pgTable('store_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
