/**
 * Integration tests against a real Postgres DB — run via `bun run test:db`.
 *
 * These exercise the SQL paths in `token-service.ts` that the mocked unit
 * tests can't reach:
 *  - bucket routing on credit (plan vs purchased) and the upsert
 *  - deduction order: grant lots (soonest expiry first) → legacy plan
 *    tokens → purchased, with the split recorded in the ledger
 *  - the FOR UPDATE row lock serializing concurrent spends (no overdraft)
 *  - lazy expiry of overdue lots during a spend
 *  - expirePlanTokens zeroing plan bucket + lots but never purchased tokens
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/server/db';
import { organization } from '@/server/db/schema/organization';
import {
  saasTokenBalances,
  saasTokenLots,
  saasTokenTransactions,
} from '@/core-subscriptions/schema/subscriptions';
import {
  addTokens,
  deductTokens,
  expirePlanTokens,
  expireDueTokenLots,
  findOrgsWithDueLots,
  getTokenBalance,
  getTokenBalanceRecord,
} from '@/core-subscriptions/lib/token-service';
import { setBillingConfig, clearBillingConfig } from '@/core-subscriptions/lib/billing-config';

const DAY_MS = 24 * 60 * 60 * 1000;

async function makeOrg(label: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(organization).values({
    id,
    name: `org-${label}`,
    slug: `${label}-${id.slice(0, 8)}`,
    createdAt: new Date(),
  });
  return id;
}

async function ledgerFor(orgId: string) {
  return db
    .select()
    .from(saasTokenTransactions)
    .where(eq(saasTokenTransactions.organizationId, orgId))
    .orderBy(asc(saasTokenTransactions.createdAt));
}

beforeEach(async () => {
  clearBillingConfig();
  await db.delete(saasTokenTransactions);
  await db.delete(saasTokenLots);
  await db.delete(saasTokenBalances);
  await db.delete(organization);
});

describe('addTokens buckets (DB)', () => {
  it('routes credits to the right bucket and totals both', async () => {
    const orgId = await makeOrg('buckets');

    await addTokens(orgId, 100, 'subscription_grant', { periodKey: '2026-07-01' }, { bucket: 'plan' });
    await addTokens(orgId, 50, 'purchase', { packId: 'p1' });

    const record = await getTokenBalanceRecord(orgId);
    expect(record!.planBalance).toBe(100);
    expect(record!.balance).toBe(50);
    expect(record!.lifetimeAdded).toBe(150);
    expect(await getTokenBalance(orgId)).toBe(150);

    const ledger = await ledgerFor(orgId);
    expect(ledger).toHaveLength(2);
    expect((ledger[0]!.metadata as Record<string, unknown>).bucket).toBe('plan');
    expect((ledger[1]!.metadata as Record<string, unknown>).bucket).toBe('purchased');
    expect(ledger[1]!.balanceAfter).toBe(150);
  });
});

describe('deductTokens order and split (DB)', () => {
  it('drains plan tokens before purchased and records the split', async () => {
    const orgId = await makeOrg('split');
    await addTokens(orgId, 100, 'subscription_grant', undefined, { bucket: 'plan' });
    await addTokens(orgId, 50, 'purchase');

    const total = await deductTokens(orgId, 120, 'usage', { feature: 'test' });
    expect(total).toBe(30);

    const record = await getTokenBalanceRecord(orgId);
    expect(record!.planBalance).toBe(0);
    expect(record!.balance).toBe(30);
    expect(record!.lifetimeUsed).toBe(120);

    const ledger = await ledgerFor(orgId);
    const debit = ledger.find((t) => t.amount === -120)!;
    const meta = debit.metadata as Record<string, unknown>;
    expect(meta.planUsed).toBe(100);
    expect(meta.purchasedUsed).toBe(20);
  });

  it('throws on insufficient funds and leaves the balance untouched', async () => {
    const orgId = await makeOrg('insufficient');
    await addTokens(orgId, 40, 'purchase');

    await expect(deductTokens(orgId, 41, 'usage')).rejects.toThrow(/Insufficient tokens: have 40, need 41/);
    expect(await getTokenBalance(orgId)).toBe(40);
  });

  it('serializes concurrent spends — exactly one of two overlapping deducts wins', async () => {
    const orgId = await makeOrg('race');
    await addTokens(orgId, 100, 'purchase');

    const results = await Promise.allSettled([
      deductTokens(orgId, 60, 'usage', { attempt: 1 }),
      deductTokens(orgId, 60, 'usage', { attempt: 2 }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    expect(await getTokenBalance(orgId)).toBe(40);
  });
});

describe('grant lots (DB)', () => {
  it('creates a lot for plan credits with expiresAt', async () => {
    const orgId = await makeOrg('lot');
    const expiresAt = new Date(Date.now() + 90 * DAY_MS);
    await addTokens(orgId, 100, 'subscription_grant', undefined, { bucket: 'plan', expiresAt });

    const lots = await db.select().from(saasTokenLots).where(eq(saasTokenLots.organizationId, orgId));
    expect(lots).toHaveLength(1);
    expect(lots[0]!.remaining).toBe(100);
    expect(lots[0]!.initialAmount).toBe(100);
  });

  it('drains the soonest-expiring lot first', async () => {
    const orgId = await makeOrg('fifo');
    const later = new Date(Date.now() + 60 * DAY_MS);
    const sooner = new Date(Date.now() + 10 * DAY_MS);
    await addTokens(orgId, 100, 'subscription_grant', { key: 'later' }, { bucket: 'plan', expiresAt: later });
    await addTokens(orgId, 100, 'subscription_grant', { key: 'sooner' }, { bucket: 'plan', expiresAt: sooner });

    await deductTokens(orgId, 150, 'usage');

    const lots = await db
      .select()
      .from(saasTokenLots)
      .where(eq(saasTokenLots.organizationId, orgId))
      .orderBy(asc(saasTokenLots.expiresAt));
    // sooner lot fully drained, later lot half drained
    expect(lots[0]!.remaining).toBe(0);
    expect(lots[1]!.remaining).toBe(50);
    expect((await getTokenBalanceRecord(orgId))!.planBalance).toBe(50);
  });

  it('lazily expires overdue lots before checking funds', async () => {
    // The persistent pre-spend sweep is gated on the lots feature being on
    setBillingConfig({ mode: 'subscription-tokens', planTokenValidityMonths: 12 });
    const orgId = await makeOrg('lazy');
    await addTokens(orgId, 100, 'subscription_grant', undefined, {
      bucket: 'plan',
      expiresAt: new Date(Date.now() - DAY_MS), // already expired
    });
    await addTokens(orgId, 50, 'purchase');

    // Raw total still shows 150 (unswept), but expired tokens must not be spendable
    expect(await getTokenBalance(orgId)).toBe(150);
    await expect(deductTokens(orgId, 60, 'usage')).rejects.toThrow(/have 50, need 60/);

    const record = await getTokenBalanceRecord(orgId);
    expect(record!.planBalance).toBe(0);
    expect(record!.balance).toBe(50);

    const expiry = (await ledgerFor(orgId)).find((t) => t.reason === 'expiry');
    expect(expiry!.amount).toBe(-100);
  });

  it('expireDueTokenLots + findOrgsWithDueLots sweep overdue lots', async () => {
    const dueOrg = await makeOrg('due');
    const freshOrg = await makeOrg('fresh');
    await addTokens(dueOrg, 100, 'subscription_grant', undefined, {
      bucket: 'plan',
      expiresAt: new Date(Date.now() - DAY_MS),
    });
    await addTokens(freshOrg, 100, 'subscription_grant', undefined, {
      bucket: 'plan',
      expiresAt: new Date(Date.now() + 30 * DAY_MS),
    });

    const orgs = await findOrgsWithDueLots();
    expect(orgs).toContain(dueOrg);
    expect(orgs).not.toContain(freshOrg);

    expect(await expireDueTokenLots(dueOrg)).toBe(100);
    expect(await getTokenBalance(dueOrg)).toBe(0);
    expect(await getTokenBalance(freshOrg)).toBe(100);
  });
});

describe('expirePlanTokens (DB)', () => {
  it('zeroes the plan bucket and its lots, never purchased tokens', async () => {
    const orgId = await makeOrg('reset');
    await addTokens(orgId, 100, 'subscription_grant', undefined, {
      bucket: 'plan',
      expiresAt: new Date(Date.now() + 30 * DAY_MS),
    });
    await addTokens(orgId, 40, 'subscription_grant', undefined, { bucket: 'plan' }); // legacy, no lot
    await addTokens(orgId, 50, 'purchase');

    const expired = await expirePlanTokens(orgId, { periodKey: '2026-08-01' });
    expect(expired).toBe(140);

    const record = await getTokenBalanceRecord(orgId);
    expect(record!.planBalance).toBe(0);
    expect(record!.balance).toBe(50);

    const [lot] = await db.select().from(saasTokenLots).where(
      and(eq(saasTokenLots.organizationId, orgId)),
    );
    expect(lot!.remaining).toBe(0);
  });

  it('is a no-op with an empty plan bucket', async () => {
    const orgId = await makeOrg('noop');
    await addTokens(orgId, 50, 'purchase');
    expect(await expirePlanTokens(orgId)).toBe(0);
    expect(await getTokenBalance(orgId)).toBe(50);
  });
});
