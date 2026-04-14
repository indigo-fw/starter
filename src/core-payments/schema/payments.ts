import { integer, jsonb, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { organization } from '@/server/db/schema/organization';

// ─── saas_subscription_events ────────────────────────────────────────────────
// Idempotency log for processed webhook events (provider-agnostic).

export const saasSubscriptionEvents = pgTable('saas_subscription_events', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  providerId: varchar('provider_id', { length: 50 }).notNull().default('stripe'),
  providerEventId: text('provider_event_id').notNull().unique(),
  type: varchar('type', { length: 100 }).notNull(),
  data: jsonb('data'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── saas_payment_transactions ───────────────────────────────────────────────
// Records individual payment transactions across all providers.

export const transactionTypeEnum = pgEnum('saas_transaction_type', [
  'payment', 'authorization', 'capture', 'refund', 'void',
]);

export const saasPaymentTransactions = pgTable('saas_payment_transactions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('user_id'),
  providerId: varchar('provider_id', { length: 50 }).notNull(),
  providerTxId: text('provider_tx_id'),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('usd'),
  status: varchar('status', { length: 30 }).notNull().default('pending'),
  planId: varchar('plan_id', { length: 50 }),
  interval: varchar('interval', { length: 10 }),
  discountCodeId: text('discount_code_id'),
  discountAmountCents: integer('discount_amount_cents').notNull().default(0),
  rawRequest: jsonb('raw_request'),
  rawResponse: jsonb('raw_response'),
  // Auth/capture fields
  transactionType: transactionTypeEnum('transaction_type').notNull().default('payment'),
  paymentIntentId: text('payment_intent_id'),
  paymentMethodId: text('payment_method_id'),
  authorizedAmountCents: integer('authorized_amount_cents'),
  capturedAmountCents: integer('captured_amount_cents'),
  authorizationExpiresAt: timestamp('authorization_expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
