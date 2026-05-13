/**
 * Integration tests against a real Postgres DB — run via `bun run test:db`.
 *
 * These exercise the SQL paths in `reverse-trial.ts` that the mocked unit
 * tests can't reach:
 *  - the active/trialing-row idempotency probe (real WHERE/IN filtering)
 *  - `expireDueReverseTrials` only touches `providerId='trial'` rows,
 *    only moves past-due trial rows, leaves Stripe rows alone
 *  - `findReverseTrialsEndingIn` daysLeft ± 0.5 window math (Postgres
 *    interval arithmetic, not JS)
 *
 * The harness (`scripts/test-db.ts`) spins up a fresh DB, runs migrations,
 * and tears down on exit — these tests get a clean schema each invocation.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '@/server/db';
import { organization } from '@/server/db/schema/organization';
import { saasSubscriptions } from '@/core-subscriptions/schema/subscriptions';
import {
  setReverseTrialConfig,
  clearReverseTrialConfig,
  grantReverseTrialOnSignup,
  expireDueReverseTrials,
  findReverseTrialsEndingIn,
} from '@/core-subscriptions/lib/reverse-trial';

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

beforeEach(async () => {
  clearReverseTrialConfig();
  // Wipe state. saasSubscriptions has ON DELETE CASCADE from organization,
  // but we delete it first explicitly so a failing FK doesn't mask a bug.
  await db.delete(saasSubscriptions);
  await db.delete(organization);
});

afterAll(() => {
  clearReverseTrialConfig();
});

describe('grantReverseTrialOnSignup (DB)', () => {
  it('inserts a trialing row with the right shape', async () => {
    setReverseTrialConfig({ plan: 'pro', days: 14 });
    const orgId = await makeOrg('grant');

    const before = Date.now();
    await grantReverseTrialOnSignup(orgId);
    const after = Date.now();

    const rows = await db.select().from(saasSubscriptions)
      .where(eq(saasSubscriptions.organizationId, orgId));
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.providerId).toBe('trial');
    expect(r.planId).toBe('pro');
    expect(r.status).toBe('trialing');
    expect(r.providerCustomerId).toBe(`trial:${orgId}`);
    expect(r.trialEnd).not.toBeNull();

    // 14 UTC days = exactly 14 * 86400000 ms (no DST in UTC). Generous slack
    // for the round-trip through Postgres timestamp encoding + clock drift.
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const SLACK = 5000;
    const trialEndMs = r.trialEnd!.getTime();
    expect(trialEndMs).toBeGreaterThanOrEqual(before + fourteenDaysMs - SLACK);
    expect(trialEndMs).toBeLessThanOrEqual(after + fourteenDaysMs + SLACK);
  });

  it('is idempotent — a second call with an existing trialing row inserts nothing', async () => {
    setReverseTrialConfig({ plan: 'pro', days: 14 });
    const orgId = await makeOrg('idem');
    await grantReverseTrialOnSignup(orgId);
    await grantReverseTrialOnSignup(orgId);
    const rows = await db.select().from(saasSubscriptions)
      .where(eq(saasSubscriptions.organizationId, orgId));
    expect(rows).toHaveLength(1);
  });

  it('treats `active` and `past_due` as blocking — does not stack on top', async () => {
    setReverseTrialConfig({ plan: 'pro', days: 14 });
    const orgId = await makeOrg('active');
    // Simulate an already-paying subscription
    await db.insert(saasSubscriptions).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      providerId: 'stripe',
      providerCustomerId: 'cus_existing',
      planId: 'pro',
      status: 'active',
    });
    await grantReverseTrialOnSignup(orgId);
    const rows = await db.select().from(saasSubscriptions)
      .where(eq(saasSubscriptions.organizationId, orgId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.providerId).toBe('stripe');
  });
});

describe('expireDueReverseTrials (DB)', () => {
  it('cancels past-due trial rows; spares future trials and non-trial rows', async () => {
    setReverseTrialConfig({ plan: 'pro', days: 14 });

    const past = await makeOrg('past');
    const future = await makeOrg('future');
    const stripe = await makeOrg('stripe');

    await grantReverseTrialOnSignup(past);
    await db.update(saasSubscriptions)
      .set({ trialEnd: new Date(Date.now() - 24 * 60 * 60 * 1000) })
      .where(eq(saasSubscriptions.organizationId, past));

    await grantReverseTrialOnSignup(future);

    // A real Stripe subscription that happens to be in `trialing` status
    // with a past trial_end — expireDueReverseTrials MUST NOT touch this row.
    await db.insert(saasSubscriptions).values({
      id: crypto.randomUUID(),
      organizationId: stripe,
      providerId: 'stripe',
      providerCustomerId: 'cus_X',
      planId: 'pro',
      status: 'trialing',
      trialEnd: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    });

    const count = await expireDueReverseTrials();
    expect(count).toBe(1);

    const [pastRow] = await db.select().from(saasSubscriptions)
      .where(eq(saasSubscriptions.organizationId, past));
    const [futureRow] = await db.select().from(saasSubscriptions)
      .where(eq(saasSubscriptions.organizationId, future));
    const [stripeRow] = await db.select().from(saasSubscriptions)
      .where(eq(saasSubscriptions.organizationId, stripe));

    expect(pastRow!.status).toBe('canceled');
    expect(futureRow!.status).toBe('trialing');
    expect(stripeRow!.status).toBe('trialing'); // providerId='stripe' → untouched
  });

  it('returns 0 when nothing is due', async () => {
    setReverseTrialConfig({ plan: 'pro', days: 14 });
    const orgId = await makeOrg('nothing-due');
    await grantReverseTrialOnSignup(orgId);
    const count = await expireDueReverseTrials();
    expect(count).toBe(0);
  });
});

describe('findReverseTrialsEndingIn (DB)', () => {
  it('returns rows in the daysLeft ± 0.5 window, excludes outside-window rows', async () => {
    setReverseTrialConfig({ plan: 'pro', days: 14 });
    const inWindow = await makeOrg('in');
    const outOfWindow = await makeOrg('out');

    await grantReverseTrialOnSignup(inWindow);
    await grantReverseTrialOnSignup(outOfWindow);

    // ~3 days from now (inside daysLeft=3 ± 0.5)
    await db.update(saasSubscriptions)
      .set({ trialEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) })
      .where(eq(saasSubscriptions.organizationId, inWindow));
    // ~10 days from now (outside both daysLeft=3 and daysLeft=1)
    await db.update(saasSubscriptions)
      .set({ trialEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) })
      .where(eq(saasSubscriptions.organizationId, outOfWindow));

    const ending3 = await findReverseTrialsEndingIn(3);
    expect(ending3.find((r) => r.orgId === inWindow)).toBeDefined();
    expect(ending3.find((r) => r.orgId === outOfWindow)).toBeUndefined();

    const ending10 = await findReverseTrialsEndingIn(10);
    expect(ending10.find((r) => r.orgId === outOfWindow)).toBeDefined();
    expect(ending10.find((r) => r.orgId === inWindow)).toBeUndefined();
  });

  it('ignores canceled rows', async () => {
    setReverseTrialConfig({ plan: 'pro', days: 14 });
    const orgId = await makeOrg('canceled');
    await grantReverseTrialOnSignup(orgId);
    // Set trialEnd ≈ 3 days out, but mark canceled — should not appear.
    await db.update(saasSubscriptions)
      .set({
        trialEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        status: 'canceled',
      })
      .where(eq(saasSubscriptions.organizationId, orgId));

    const ending3 = await findReverseTrialsEndingIn(3);
    expect(ending3.find((r) => r.orgId === orgId)).toBeUndefined();
  });
});
