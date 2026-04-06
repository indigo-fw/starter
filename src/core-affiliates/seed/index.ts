/**
 * Seed Affiliates Demo Data
 *
 * Creates 6 affiliates with referrals, purchase events, and commissions.
 * Requires billing seed to run first (uses seeded userIds).
 *
 * Uses faker seed(43) for deterministic output (offset from billing seed).
 * Safe to run multiple times — skips if affiliate data already exists.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { count } from 'drizzle-orm';
import crypto from 'crypto';
import { faker } from '@faker-js/faker';
import { log } from '@/scripts/seed/helpers';

const SEED = 43;
const NUM_AFFILIATES = 6;

function uuid(): string {
  return crypto.randomUUID();
}

function pick<T>(arr: T[]): T {
  return faker.helpers.arrayElement(arr);
}

export async function seedAffiliates(
  db: PostgresJsDatabase,
  _superadminUserId: string,
  context?: { userIds: string[]; orgIds: string[] },
): Promise<{ userIds?: string[]; orgIds?: string[] }> {
  faker.seed(SEED);

  const userIds = context?.userIds ?? [];
  if (userIds.length < NUM_AFFILIATES) {
    log('\u26A0\uFE0F', `Not enough users (${userIds.length}) for affiliate seed. Seed demo users first.`);
    return {};
  }

  const {
    saasAffiliates,
    saasReferrals,
    saasAffiliateEvents,
  } = await import('@/core-affiliates/schema/affiliates');

  // Idempotency check
  const [existing] = await db.select({ count: count() }).from(saasAffiliates);
  if ((existing?.count ?? 0) > 0) {
    log('\u23ED\uFE0F', 'Affiliate data already exists. Skipping seed.');
    return {};
  }

  log('\uD83E\uDD1D', `Creating ${NUM_AFFILIATES} affiliates...`);

  for (let i = 0; i < NUM_AFFILIATES; i++) {
    const affId = uuid();
    const totalReferrals = faker.number.int({ min: 2, max: 20 });
    const convertedCount = Math.ceil(totalReferrals * faker.number.float({ min: 0.3, max: 0.8 }));
    const commissionPercent = pick([15, 20, 20, 20, 25, 30]);
    const avgPurchase = pick([1900, 4900, 9900]);
    const totalEarnings = Math.round(convertedCount * avgPurchase * commissionPercent / 100);

    await db.insert(saasAffiliates).values({
      id: affId,
      userId: userIds[i]!,
      code: faker.string.alpha({ length: 3, casing: 'upper' })
        + '-'
        + faker.string.alphanumeric({ length: 5, casing: 'upper' }),
      commissionPercent,
      status: faker.helpers.weightedArrayElement([
        { value: 'active', weight: 80 },
        { value: 'suspended', weight: 15 },
        { value: 'banned', weight: 5 },
      ]),
      totalReferrals,
      totalEarningsCents: totalEarnings,
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: faker.date.recent({ days: 30 }),
    });

    const refCount = Math.min(totalReferrals, 8);
    for (let r = 0; r < refCount; r++) {
      const refId = uuid();
      const isConverted = r < convertedCount;

      await db.insert(saasReferrals).values({
        id: refId,
        affiliateId: affId,
        referredUserId: uuid(),
        status: isConverted ? 'converted' : 'pending',
        convertedAt: isConverted ? faker.date.recent({ days: 60 }) : null,
        createdAt: faker.date.past({ years: 1 }),
      });

      await db.insert(saasAffiliateEvents).values({
        id: uuid(),
        affiliateId: affId,
        referralId: refId,
        type: 'signup',
        amountCents: null,
        createdAt: faker.date.past({ years: 1 }),
      });

      if (isConverted) {
        const purchaseAmount = pick([1900, 4900, 9900, 19000, 49000]);
        const commission = Math.round(purchaseAmount * commissionPercent / 100);

        await db.insert(saasAffiliateEvents).values({
          id: uuid(),
          affiliateId: affId,
          referralId: refId,
          type: 'purchase',
          amountCents: purchaseAmount,
          metadata: { transactionId: `pi_${faker.string.alphanumeric(16)}` },
          createdAt: faker.date.recent({ days: 60 }),
        });

        await db.insert(saasAffiliateEvents).values({
          id: uuid(),
          affiliateId: affId,
          referralId: refId,
          type: 'commission',
          amountCents: commission,
          createdAt: faker.date.recent({ days: 55 }),
        });
      }
    }
  }
  log('\u2705', `${NUM_AFFILIATES} affiliates created.`);

  return {};
}
