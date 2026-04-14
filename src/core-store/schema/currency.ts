import { numeric, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const storeExchangeRates = pgTable('store_exchange_rates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  /** Base currency (e.g. 'EUR') */
  baseCurrency: varchar('base_currency', { length: 3 }).notNull(),
  /** Target currency (e.g. 'USD') */
  targetCurrency: varchar('target_currency', { length: 3 }).notNull(),
  /** Exchange rate (e.g. 1.08 means 1 EUR = 1.08 USD) */
  rate: numeric('rate', { precision: 12, scale: 6 }).notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
