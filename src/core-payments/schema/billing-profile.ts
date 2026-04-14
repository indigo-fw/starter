import { boolean, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { organization } from '@/server/db/schema/organization';

// ─── Billing Profile (1:1 with organization) ──────────────────────────────
// The billing identity for an organization. Used by store orders, subscriptions,
// and any module that needs to invoice or tax-calculate for a customer entity.
//
// B2C: personal org → legalName = user's full name, company fields null.
// B2B: company org → legalName = legal entity name, vatId for reverse charge, etc.

export const billingProfiles = pgTable('billing_profiles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id')
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: 'cascade' }),
  /** Legal name for invoices (person name or company name) */
  legalName: varchar('legal_name', { length: 255 }).notNull(),
  /** Company registration number (ICO, EIN, Company Number, etc.) */
  companyRegistrationId: varchar('company_registration_id', { length: 100 }),
  /** EU VAT ID (e.g. SK2020123456) — enables reverse charge */
  vatId: varchar('vat_id', { length: 50 }),
  /** Tax-exempt entity (e.g. non-profit, government) */
  taxExempt: boolean('tax_exempt').notNull().default(false),
  /** Invoice recipient email (overrides user email if set) */
  invoiceEmail: varchar('invoice_email', { length: 255 }),
  /** Contact phone */
  phone: varchar('phone', { length: 30 }),
  /** Billing address (goes on every invoice) */
  address1: varchar('address_1', { length: 255 }),
  address2: varchar('address_2', { length: 255 }),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 100 }),
  postalCode: varchar('postal_code', { length: 20 }),
  /** ISO 3166-1 alpha-2 */
  country: varchar('country', { length: 2 }),
  /** Default currency for new orders/subscriptions */
  defaultCurrency: varchar('default_currency', { length: 3 }).notNull().default('EUR'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
