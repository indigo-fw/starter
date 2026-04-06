/**
 * Seed Billing Demo Data
 *
 * Creates billing-specific demo data:
 * - 15 subscriptions, 40 transactions, 5 discount codes
 * - Token balances + ledger entries for all orgs
 *
 * Requires users/orgs to be seeded first (passed via context).
 * Uses faker seed(42) for deterministic output.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { count } from 'drizzle-orm';
import crypto from 'crypto';
import { faker } from '@faker-js/faker';
import { log } from '@/scripts/seed/helpers';

const SEED = 42;
const NUM_SUBSCRIPTIONS = 15;
const NUM_TRANSACTIONS = 40;
const NUM_DISCOUNT_CODES = 5;
const TRANSACTION_SPREAD_DAYS = 120;

function uuid(): string {
  return crypto.randomUUID();
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function pick<T>(arr: T[]): T {
  return faker.helpers.arrayElement(arr);
}

const PLANS = ['starter', 'pro', 'enterprise'] as const;
const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  starter: { monthly: 1900, yearly: 19000 },
  pro: { monthly: 4900, yearly: 49000 },
  enterprise: { monthly: 9900, yearly: 99000 },
};

const DISCOUNT_TYPES = ['percentage', 'fixed_price', 'trial', 'free_trial'] as const;

export async function seedBilling(
  db: PostgresJsDatabase,
  _superadminUserId: string,
  context?: { userIds: string[]; orgIds: string[] },
): Promise<{ userIds?: string[]; orgIds?: string[] }> {
  faker.seed(SEED);

  const userIds = context?.userIds ?? [];
  const orgIds = context?.orgIds ?? [];

  if (userIds.length === 0 || orgIds.length === 0) {
    log('\u26A0\uFE0F', 'No users/orgs available. Seed demo users first.');
    return {};
  }

  const {
    saasSubscriptions,
    saasDiscountCodes,
    saasDiscountUsages,
    saasTokenBalances,
    saasTokenTransactions,
  } = await import('@/core-subscriptions/schema/subscriptions');
  const { saasPaymentTransactions } = await import('@/core-payments/schema/payments');

  // Idempotency check
  const [existingSubs] = await db.select({ count: count() }).from(saasSubscriptions);
  if ((existingSubs?.count ?? 0) > 0) {
    log('\u23ED\uFE0F', 'Billing data already exists. Skipping seed.');
    return {};
  }

  // ─── 1. Subscriptions ─────────────────────────────────────────────
  log('\uD83D\uDCB3', `Creating ${NUM_SUBSCRIPTIONS} subscriptions...`);

  const statusWeights = [
    { value: 'active', weight: 50 },
    { value: 'trialing', weight: 10 },
    { value: 'canceled', weight: 20 },
    { value: 'past_due', weight: 10 },
    { value: 'unpaid', weight: 10 },
  ] as const;

  for (let i = 0; i < NUM_SUBSCRIPTIONS; i++) {
    const plan = pick([...PLANS]);
    const interval = pick(['monthly', 'yearly']);
    const status = faker.helpers.weightedArrayElement([...statusWeights]);
    const createdDaysAgo = faker.number.int({ min: 5, max: TRANSACTION_SPREAD_DAYS });
    const periodStart = daysAgo(createdDaysAgo);
    const periodDays = interval === 'monthly' ? 30 : 365;
    const periodEnd = new Date(periodStart.getTime() + periodDays * 24 * 60 * 60 * 1000);
    const canceledDaysAgo = status === 'canceled'
      ? faker.number.int({ min: 1, max: createdDaysAgo })
      : 0;

    await db.insert(saasSubscriptions).values({
      id: uuid(),
      organizationId: orgIds[i % orgIds.length]!,
      providerId: pick(['stripe', 'stripe', 'stripe', 'nowpayments']),
      providerCustomerId: `cus_${faker.string.alphanumeric(14)}`,
      providerSubscriptionId: `sub_${faker.string.alphanumeric(14)}`,
      planId: plan,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: status === 'canceled',
      trialEnd: status === 'trialing'
        ? new Date(Date.now() + faker.number.int({ min: 1, max: 14 }) * 24 * 60 * 60 * 1000)
        : null,
      createdAt: daysAgo(createdDaysAgo),
      updatedAt: status === 'canceled' ? daysAgo(canceledDaysAgo) : daysAgo(createdDaysAgo),
    });
  }
  log('\u2705', `${NUM_SUBSCRIPTIONS} subscriptions created.`);

  // ─── 2. Transactions ──────────────────────────────────────────────
  log('\uD83D\uDCB0', `Creating ${NUM_TRANSACTIONS} transactions...`);

  const txStatusWeights = [
    { value: 'successful', weight: 75 },
    { value: 'pending', weight: 5 },
    { value: 'failed', weight: 10 },
    { value: 'refunded', weight: 10 },
  ] as const;

  for (let i = 0; i < NUM_TRANSACTIONS; i++) {
    const plan = pick([...PLANS]);
    const interval = pick(['monthly', 'yearly']);
    const prices = PLAN_PRICES[plan]!;
    const baseAmount = interval === 'monthly' ? prices.monthly : prices.yearly;
    const orgIdx = faker.number.int({ min: 0, max: orgIds.length - 1 });
    const txDay = Math.round((i / NUM_TRANSACTIONS) * TRANSACTION_SPREAD_DAYS);

    await db.insert(saasPaymentTransactions).values({
      id: uuid(),
      organizationId: orgIds[orgIdx]!,
      userId: userIds[orgIdx % userIds.length]!,
      providerId: 'stripe',
      providerTxId: `pi_${faker.string.alphanumeric(24)}`,
      amountCents: baseAmount,
      currency: 'usd',
      status: faker.helpers.weightedArrayElement([...txStatusWeights]),
      planId: plan,
      interval,
      discountCodeId: null,
      discountAmountCents: 0,
      createdAt: daysAgo(txDay),
      updatedAt: daysAgo(txDay),
    });
  }
  log('\u2705', `${NUM_TRANSACTIONS} transactions created.`);

  // ─── 3. Discount codes ────────────────────────────────────────────
  log('\uD83C\uDFF7\uFE0F', `Creating ${NUM_DISCOUNT_CODES} discount codes...`);

  for (let i = 0; i < NUM_DISCOUNT_CODES; i++) {
    const discountType = pick([...DISCOUNT_TYPES]);
    const codeId = uuid();
    const currentUses = faker.number.int({ min: 0, max: 30 });
    const maxUses = faker.datatype.boolean(0.7)
      ? faker.number.int({ min: currentUses, max: 200 })
      : null;

    await db.insert(saasDiscountCodes).values({
      id: codeId,
      code: faker.string.alpha({ length: faker.number.int({ min: 4, max: 6 }), casing: 'upper' })
        + faker.number.int({ min: 10, max: 99 }),
      isActive: faker.datatype.boolean(0.8),
      discountType,
      discountValue: discountType === 'percentage'
        ? faker.number.int({ min: 5, max: 50 })
        : discountType === 'fixed_price'
          ? faker.number.int({ min: 500, max: 5000 })
          : null,
      trialDays: discountType === 'trial' || discountType === 'free_trial'
        ? faker.number.int({ min: 7, max: 30 })
        : null,
      trialPriceCents: discountType === 'trial'
        ? faker.number.int({ min: 100, max: 1000 })
        : null,
      maxUses,
      currentUses,
      maxUsesPerUser: 1,
      validFrom: daysAgo(faker.number.int({ min: 30, max: 120 })),
      validUntil: faker.datatype.boolean(0.6)
        ? new Date(Date.now() + faker.number.int({ min: 30, max: 180 }) * 24 * 60 * 60 * 1000)
        : null,
      createdAt: daysAgo(faker.number.int({ min: 30, max: 120 })),
    });

    const usageCount = Math.min(currentUses, faker.number.int({ min: 1, max: 5 }));
    for (let u = 0; u < usageCount; u++) {
      await db.insert(saasDiscountUsages).values({
        id: uuid(),
        userId: pick(userIds),
        discountCodeId: codeId,
        planId: pick([...PLANS]),
        appliedAt: faker.date.recent({ days: 60 }),
        usedAt: faker.datatype.boolean(0.7) ? faker.date.recent({ days: 30 }) : null,
      }).onConflictDoNothing();
    }
  }
  log('\u2705', `${NUM_DISCOUNT_CODES} discount codes created.`);

  // ─── 4. Token balances ──────────────────────────────────────────────
  log('\uD83E\uDE99', `Creating token balances for ${orgIds.length} organizations...`);

  for (let i = 0; i < orgIds.length; i++) {
    const balance = faker.number.int({ min: 50, max: 5000 });
    const lifetimeAdded = balance + faker.number.int({ min: 100, max: 3000 });
    const lifetimeUsed = lifetimeAdded - balance;

    await db.insert(saasTokenBalances).values({
      id: uuid(),
      organizationId: orgIds[i]!,
      balance,
      lifetimeAdded,
      lifetimeUsed,
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: faker.date.recent({ days: 7 }),
    }).onConflictDoNothing();

    const txCount = faker.number.int({ min: 3, max: 8 });
    let runningBalance = 0;
    for (let t = 0; t < txCount; t++) {
      const isCredit = t === 0 || faker.datatype.boolean(0.3);
      const amount = isCredit
        ? faker.number.int({ min: 100, max: 2000 })
        : -faker.number.int({ min: 10, max: 200 });
      runningBalance = Math.max(0, runningBalance + amount);

      await db.insert(saasTokenTransactions).values({
        id: uuid(),
        organizationId: orgIds[i]!,
        amount,
        balanceAfter: runningBalance,
        reason: isCredit
          ? pick(['purchase', 'bonus', 'refund'])
          : pick(['usage', 'ai-generate', 'api-call']),
        metadata: !isCredit ? { feature: pick(['ai-generate', 'image-resize', 'translation', 'export']) } : null,
        createdAt: daysAgo(Math.round((t / txCount) * 60)),
      });
    }
  }
  log('\u2705', `Token balances and ledger entries created.`);

  return {};
}
