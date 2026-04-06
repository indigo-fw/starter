import { boolean, index, integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
// Note: saasSubscriptionEvents and saasPaymentTransactions moved to @/core-payments/schema/payments
import { organization } from '@/server/db/schema/organization';

// ─── saas_subscriptions ──────────────────────────────────────────────────────
// Tracks subscriptions per organization (provider-agnostic).

export const saasSubscriptions = pgTable(
  'saas_subscriptions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    providerId: varchar('provider_id', { length: 50 }).notNull().default('stripe'),
    providerCustomerId: text('provider_customer_id').notNull(),
    providerSubscriptionId: text('provider_subscription_id').unique(),
    providerPriceId: text('provider_price_id'),
    planId: varchar('plan_id', { length: 50 }).notNull().default('free'),
    status: varchar('status', { length: 30 }).notNull().default('active'),
    currentPeriodStart: timestamp('current_period_start'),
    currentPeriodEnd: timestamp('current_period_end'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    trialEnd: timestamp('trial_end'),
    gracePeriodEndsAt: timestamp('grace_period_ends_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('saas_subscriptions_org_idx').on(t.organizationId),
    index('saas_subscriptions_status_org_idx').on(t.status, t.organizationId),
  ]
);

// ─── saas_discount_codes ─────────────────────────────────────────────────────
// Discount/coupon code definitions.

export const saasDiscountCodes = pgTable('saas_discount_codes', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  code: text('code').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  discountType: varchar('discount_type', { length: 30 }).notNull(), // percentage|fixed_price|trial|free_trial
  discountValue: integer('discount_value'), // percentage (0-100) or fixed price in cents
  trialDays: integer('trial_days'),
  trialPriceCents: integer('trial_price_cents'),
  /** Per-plan overrides: { planId: { type, value, trialDays?, trialPriceCents? } } */
  planSpecificDiscounts: jsonb('plan_specific_discounts'),
  maxUses: integer('max_uses'), // null = unlimited
  currentUses: integer('current_uses').notNull().default(0),
  maxUsesPerUser: integer('max_uses_per_user').notNull().default(1),
  validFrom: timestamp('valid_from'),
  validUntil: timestamp('valid_until'),
  /** Countdown hours after applying (time-limited offers) */
  timeLimitHours: integer('time_limit_hours'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── saas_discount_usages ────────────────────────────────────────────────────
// Tracks per-user discount code usage.

export const saasDiscountUsages = pgTable('saas_discount_usages', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  discountCodeId: text('discount_code_id')
    .notNull()
    .references(() => saasDiscountCodes.id, { onDelete: 'cascade' }),
  planId: varchar('plan_id', { length: 50 }),
  appliedAt: timestamp('applied_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at'),
  usedAt: timestamp('used_at'),
  removedAt: timestamp('removed_at'),
  transactionId: text('transaction_id'),
});

// ─── saas_token_balances ────────────────────────────────────────────────────
// Per-organization token/credit balances for usage-based billing.

export const saasTokenBalances = pgTable('saas_token_balances', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id')
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: 'cascade' }),
  balance: integer('balance').notNull().default(0),
  lifetimeAdded: integer('lifetime_added').notNull().default(0),
  lifetimeUsed: integer('lifetime_used').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─── saas_token_transactions ────────────────────────────────────────────────
// Ledger of every token credit/debit for auditability.

export const saasTokenTransactions = pgTable('saas_token_transactions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(), // positive = credit, negative = debit
  balanceAfter: integer('balance_after').notNull(),
  reason: varchar('reason', { length: 100 }).notNull(), // 'purchase', 'usage', 'refund', 'bonus', 'adjustment'
  metadata: jsonb('metadata'), // e.g. { feature: 'ai-generate', inputTokens: 500 }
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('saas_token_tx_org_idx').on(t.organizationId, t.createdAt),
]);
