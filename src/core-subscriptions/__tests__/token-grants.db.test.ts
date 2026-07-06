/**
 * Integration tests against a real Postgres DB — run via `bun run test:db`.
 *
 * These exercise the grant paths the mocked unit tests can't reach:
 *  - the lastGrantPeriodKey compare-and-set claim (real WHERE IS NULL OR !=)
 *  - two concurrent grant attempts for the same period → exactly one credit
 *  - upfront yearly grants storing the 'U:' claim key
 *  - mode-flip guards (monthly↔upfront never double-serve a period)
 *  - the cron sweep granting across eligible subscriptions
 *  - validity lots created for grants when planTokenValidityMonths is set
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '@/server/db';
import { organization } from '@/server/db/schema/organization';
import {
  saasSubscriptions,
  saasTokenBalances,
  saasTokenLots,
  saasTokenTransactions,
} from '@/core-subscriptions/schema/subscriptions';
import { setSubscriptionsDeps } from '@/core-subscriptions/deps';
import type { PlanDefinition } from '@/core-subscriptions/types/billing';
import { setBillingConfig, clearBillingConfig } from '@/core-subscriptions/lib/billing-config';
import {
  grantDueSubscriptionTokens,
  grantSubscriptionTokensForOrg,
  runTokenGrantChecks,
} from '@/core-subscriptions/lib/token-grants';
import { getTokenBalance } from '@/core-subscriptions/lib/token-service';

const DAY_MS = 24 * 60 * 60 * 1000;

const PRO: PlanDefinition = {
  id: 'pro',
  name: 'Pro',
  description: 'test plan',
  providerPrices: {},
  priceMonthly: 4900,
  priceYearly: 49000,
  monthlyTokens: 1000,
  features: { maxMembers: 5, maxStorageMb: 100, customDomain: false, apiAccess: true, prioritySupport: false },
};
const FREE: PlanDefinition = { ...PRO, id: 'free', name: 'Free', monthlyTokens: undefined };

setSubscriptionsDeps({
  getPlans: () => [FREE, PRO],
  getPlan: (id) => [FREE, PRO].find((p) => p.id === id),
  getPlanByProviderPriceId: () => undefined,
  getProviderPriceId: () => null,
  resolveOrgId: async (activeOrgId, userId) => activeOrgId ?? userId,
  sendOrgNotification: () => {},
  enqueueTemplateEmail: async () => {},
  broadcastEvent: () => {},
});

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

async function makeSubscription(orgId: string, opts?: {
  interval?: 'monthly' | 'yearly';
  periodDays?: number;
  lastGrantPeriodKey?: string;
}) {
  const id = crypto.randomUUID();
  const periodDays = opts?.periodDays ?? 30;
  const start = new Date(Date.now() - 2 * DAY_MS);
  await db.insert(saasSubscriptions).values({
    id,
    organizationId: orgId,
    providerId: 'stripe',
    providerCustomerId: `cus_${id.slice(0, 8)}`,
    providerSubscriptionId: `sub_${id.slice(0, 8)}`,
    planId: 'pro',
    interval: opts?.interval ?? null,
    status: 'active',
    currentPeriodStart: start,
    currentPeriodEnd: new Date(start.getTime() + periodDays * DAY_MS),
    lastGrantPeriodKey: opts?.lastGrantPeriodKey ?? null,
  });
  return { id, start };
}

async function readSub(subId: string) {
  const [row] = await db.select().from(saasSubscriptions).where(eq(saasSubscriptions.id, subId));
  return row!;
}

async function grantableRow(subId: string) {
  const row = await readSub(subId);
  return {
    id: row.id,
    organizationId: row.organizationId,
    planId: row.planId,
    interval: row.interval,
    status: row.status,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    createdAt: row.createdAt,
    lastGrantPeriodKey: row.lastGrantPeriodKey,
  };
}

beforeEach(async () => {
  clearBillingConfig();
  setBillingConfig({ mode: 'subscription-tokens' });
  await db.delete(saasTokenTransactions);
  await db.delete(saasTokenLots);
  await db.delete(saasTokenBalances);
  await db.delete(saasSubscriptions);
  await db.delete(organization);
});

describe('grant claim compare-and-set (DB)', () => {
  it('grants once per period and records the claim key', async () => {
    const orgId = await makeOrg('claim');
    const { id, start } = await makeSubscription(orgId, { interval: 'monthly' });

    await grantSubscriptionTokensForOrg(orgId);
    expect(await getTokenBalance(orgId)).toBe(1000);
    expect((await readSub(id)).lastGrantPeriodKey).toBe(start.toISOString().slice(0, 10));

    // Second attempt for the same period is a no-op
    await grantSubscriptionTokensForOrg(orgId);
    expect(await getTokenBalance(orgId)).toBe(1000);
  });

  it('exactly one of two concurrent grant attempts wins', async () => {
    const orgId = await makeOrg('race');
    const { id } = await makeSubscription(orgId, { interval: 'monthly' });
    const staleRow = await grantableRow(id); // both attempts see lastGrantPeriodKey = null

    const results = await Promise.all([
      grantDueSubscriptionTokens(staleRow),
      grantDueSubscriptionTokens(staleRow),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await getTokenBalance(orgId)).toBe(1000);
  });
});

describe('upfront yearly grants (DB)', () => {
  it('credits monthlyTokens × 12 with a U-prefixed claim key', async () => {
    setBillingConfig({ mode: 'subscription-tokens', yearlyTokenGrant: 'upfront' });
    const orgId = await makeOrg('upfront');
    const { id, start } = await makeSubscription(orgId, { interval: 'yearly', periodDays: 365 });

    await grantSubscriptionTokensForOrg(orgId);
    expect(await getTokenBalance(orgId)).toBe(12_000);
    expect((await readSub(id)).lastGrantPeriodKey).toBe(`U:${start.toISOString().slice(0, 10)}`);

    await grantSubscriptionTokensForOrg(orgId);
    expect(await getTokenBalance(orgId)).toBe(12_000);
  });

  it('trialing yearly subscriptions stay on the monthly drip (no upfront before payment)', async () => {
    setBillingConfig({ mode: 'subscription-tokens', yearlyTokenGrant: 'upfront' });
    const orgId = await makeOrg('trial-upfront');
    const { id } = await makeSubscription(orgId, { interval: 'yearly', periodDays: 365 });
    await db.update(saasSubscriptions).set({ status: 'trialing' }).where(eq(saasSubscriptions.id, id));

    await grantSubscriptionTokensForOrg(orgId);
    expect(await getTokenBalance(orgId)).toBe(1000); // drip, not 12,000
  });

  it('grantTokensDuringTrial: false withholds grants from trialing subscriptions', async () => {
    setBillingConfig({ mode: 'subscription-tokens', grantTokensDuringTrial: false });
    const orgId = await makeOrg('no-trial-grant');
    const { id } = await makeSubscription(orgId, { interval: 'monthly' });
    await db.update(saasSubscriptions).set({ status: 'trialing' }).where(eq(saasSubscriptions.id, id));

    await grantSubscriptionTokensForOrg(orgId);
    expect(await getTokenBalance(orgId)).toBe(0);
  });

  it('flip monthly → upfront mid-period does not double-serve the period', async () => {
    const orgId = await makeOrg('flip-up');
    const { id } = await makeSubscription(orgId, { interval: 'yearly', periodDays: 365 });

    // One monthly drip happened first
    await grantSubscriptionTokensForOrg(orgId);
    expect(await getTokenBalance(orgId)).toBe(1000);

    // Then the site flips to upfront — nothing until the next renewal
    setBillingConfig({ mode: 'subscription-tokens', yearlyTokenGrant: 'upfront' });
    await grantSubscriptionTokensForOrg(orgId);
    expect(await getTokenBalance(orgId)).toBe(1000);
    expect((await readSub(id)).lastGrantPeriodKey).not.toMatch(/^U:/);
  });

  it('flip upfront → monthly mid-period does not drip on top of the upfront grant', async () => {
    setBillingConfig({ mode: 'subscription-tokens', yearlyTokenGrant: 'upfront' });
    const orgId = await makeOrg('flip-down');
    await makeSubscription(orgId, { interval: 'yearly', periodDays: 365 });

    await grantSubscriptionTokensForOrg(orgId);
    expect(await getTokenBalance(orgId)).toBe(12_000);

    setBillingConfig({ mode: 'subscription-tokens', yearlyTokenGrant: 'monthly' });
    await grantSubscriptionTokensForOrg(orgId);
    expect(await getTokenBalance(orgId)).toBe(12_000);
  });
});

describe('runTokenGrantChecks sweep (DB)', () => {
  it('grants for eligible plans and skips token-less plans', async () => {
    const proOrg = await makeOrg('sweep-pro');
    await makeSubscription(proOrg, { interval: 'monthly' });

    const freeOrg = await makeOrg('sweep-free');
    const freeSubId = crypto.randomUUID();
    await db.insert(saasSubscriptions).values({
      id: freeSubId,
      organizationId: freeOrg,
      providerId: 'stripe',
      providerCustomerId: 'cus_free',
      planId: 'free',
      status: 'active',
    });

    await runTokenGrantChecks();

    expect(await getTokenBalance(proOrg)).toBe(1000);
    expect(await getTokenBalance(freeOrg)).toBe(0);
  });
});

describe('grants with validity lots (DB)', () => {
  it('creates an expiry lot for the grant when planTokenValidityMonths is set', async () => {
    setBillingConfig({ mode: 'subscription-tokens', planTokenValidityMonths: 3 });
    const orgId = await makeOrg('lots');
    await makeSubscription(orgId, { interval: 'monthly' });

    await grantSubscriptionTokensForOrg(orgId);

    const lots = await db.select().from(saasTokenLots).where(eq(saasTokenLots.organizationId, orgId));
    expect(lots).toHaveLength(1);
    expect(lots[0]!.remaining).toBe(1000);
    // ~3 months out
    const monthsOut = (lots[0]!.expiresAt.getTime() - Date.now()) / (30 * DAY_MS);
    expect(monthsOut).toBeGreaterThan(2.5);
    expect(monthsOut).toBeLessThan(3.5);
  });
});
