import { index, integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ─── saas_affiliates ──────────────────────────────────────────────────────────
// Tracks affiliate partners who earn commissions by referring new users.

export const saasAffiliates = pgTable('saas_affiliates', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().unique(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  commissionPercent: integer('commission_percent').notNull().default(20),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  totalReferrals: integer('total_referrals').notNull().default(0),
  totalEarningsCents: integer('total_earnings_cents').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── saas_referrals ───────────────────────────────────────────────────────────
// Tracks individual referral relationships (affiliate → referred user).

export const saasReferrals = pgTable('saas_referrals', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  affiliateId: text('affiliate_id')
    .notNull()
    .references(() => saasAffiliates.id, { onDelete: 'cascade' }),
  referredUserId: text('referred_user_id').notNull().unique(),
  referredOrgId: text('referred_org_id'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  convertedAt: timestamp('converted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_referrals_affiliate').on(table.affiliateId, table.status),
]);

// ─── saas_affiliate_events ────────────────────────────────────────────────────
// Event log for affiliate activity (signup, purchase, commission).

export const saasAffiliateEvents = pgTable('saas_affiliate_events', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  affiliateId: text('affiliate_id')
    .notNull()
    .references(() => saasAffiliates.id, { onDelete: 'cascade' }),
  referralId: text('referral_id'),
  type: varchar('type', { length: 30 }).notNull(),
  amountCents: integer('amount_cents'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_affiliate_events').on(table.affiliateId, table.type, table.createdAt),
]);
