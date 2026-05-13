/**
 * Integration test for `sendReverseTrialWarnings` against a real DB.
 *
 * Covers the cron path the unit tests can't:
 *  - the org→owner join via `member` + `user` (real foreign keys)
 *  - daysLeft windowing inside Postgres interval math (`now() + N days`)
 *  - per-user `cms_user_preferences` idempotency flag prevents duplicate sends
 *  - canceled trials are skipped (status filter on the trialing-end query)
 *
 * The email enqueue is mocked — we don't need a real BullMQ worker; we just
 * assert that the path through the function reaches it with the right args.
 *
 * In a separate file from `reverse-trial.db.test.ts` so the email mock
 * doesn't bleed into the other integration tests.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const { enqueueMock } = vi.hoisted(() => ({ enqueueMock: vi.fn() }));
vi.mock('@/core/lib/email', () => ({ enqueueTemplateEmail: enqueueMock }));

import { db } from '@/server/db';
import { organization, member } from '@/server/db/schema/organization';
import { user } from '@/server/db/schema/auth';
import { cmsUserPreferences } from '@/server/db/schema/user-preferences';
import { saasSubscriptions } from '@/core-subscriptions/schema/subscriptions';
import {
  setReverseTrialConfig,
  clearReverseTrialConfig,
  grantReverseTrialOnSignup,
  sendReverseTrialWarnings,
} from '@/core-subscriptions/lib/reverse-trial';

/** Create user + personal org + owner member; return both ids. */
async function makeUserAndOrg(label: string): Promise<{ userId: string; orgId: string }> {
  const userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId,
    name: `Owner ${label}`,
    email: `${label}-${userId.slice(0, 8)}@test.local`,
    emailVerified: true,
    role: 'user',
    banned: false,
  });
  const orgId = crypto.randomUUID();
  await db.insert(organization).values({
    id: orgId,
    name: `org-${label}`,
    slug: `${label}-${orgId.slice(0, 8)}`,
    createdAt: new Date(),
  });
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId,
    role: 'owner',
    createdAt: new Date(),
  });
  return { userId, orgId };
}

beforeEach(async () => {
  enqueueMock.mockClear();
  clearReverseTrialConfig();
  // Order matters: subscriptions → member → org → prefs → user (FK chain).
  await db.delete(saasSubscriptions);
  await db.delete(member);
  await db.delete(organization);
  await db.delete(cmsUserPreferences);
  await db.delete(user);
});

afterAll(() => {
  clearReverseTrialConfig();
});

describe('sendReverseTrialWarnings (DB)', () => {
  it('sends a D-3 warning, records an idempotency flag, and skips on re-run', async () => {
    setReverseTrialConfig({ plan: 'pro', days: 14 });
    const { userId, orgId } = await makeUserAndOrg('d3');
    await grantReverseTrialOnSignup(orgId);
    const trialEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await db.update(saasSubscriptions).set({ trialEnd }).where(eq(saasSubscriptions.organizationId, orgId));

    await sendReverseTrialWarnings();

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const [to, template, vars] = enqueueMock.mock.calls[0] as [string, string, Record<string, string>];
    expect(to).toMatch(/^d3-[0-9a-f]{8}@test\.local$/);
    expect(template).toBe('trial-ending');
    expect(vars.daysLeft).toBe('3');
    expect(vars.daysPlural).toBe('s');
    expect(vars.firstName).toBe('Owner'); // first token of "Owner d3"

    // Idempotency flag was written
    const [prefs] = await db.select().from(cmsUserPreferences).where(eq(cmsUserPreferences.userId, userId));
    const data = prefs!.data as Record<string, boolean>;
    const flagKey = Object.keys(data).find((k) => k.startsWith('reverseTrialWarn3d:'));
    expect(flagKey).toBeDefined();
    expect(data[flagKey!]).toBe(true);

    // Second run: must not re-send
    enqueueMock.mockClear();
    await sendReverseTrialWarnings();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('uses singular "day" for D-1 warnings', async () => {
    setReverseTrialConfig({ plan: 'pro', days: 14 });
    const { orgId } = await makeUserAndOrg('d1');
    await grantReverseTrialOnSignup(orgId);
    await db.update(saasSubscriptions)
      .set({ trialEnd: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000) })
      .where(eq(saasSubscriptions.organizationId, orgId));

    await sendReverseTrialWarnings();

    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const vars = enqueueMock.mock.calls[0][2] as Record<string, string>;
    expect(vars.daysLeft).toBe('1');
    expect(vars.daysPlural).toBe(''); // singular
  });

  it('does not send for trials outside the D-3 and D-1 windows', async () => {
    setReverseTrialConfig({ plan: 'pro', days: 14 });
    const { orgId } = await makeUserAndOrg('outside');
    await grantReverseTrialOnSignup(orgId);
    // ~7 days away: outside [0.5, 1.5] and outside [2.5, 3.5]
    await db.update(saasSubscriptions)
      .set({ trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) })
      .where(eq(saasSubscriptions.organizationId, orgId));

    await sendReverseTrialWarnings();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('does not send for canceled trials, even when trial_end is in the D-3 window', async () => {
    setReverseTrialConfig({ plan: 'pro', days: 14 });
    const { orgId } = await makeUserAndOrg('canceled');
    await grantReverseTrialOnSignup(orgId);
    await db.update(saasSubscriptions)
      .set({
        trialEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        status: 'canceled',
      })
      .where(eq(saasSubscriptions.organizationId, orgId));

    await sendReverseTrialWarnings();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('is a no-op when reverse trial is not configured', async () => {
    // Note: no setReverseTrialConfig call.
    const { orgId } = await makeUserAndOrg('noconfig');
    // Manually plant a trial row (without configured reverse trial)
    await db.insert(saasSubscriptions).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      providerId: 'trial',
      providerCustomerId: `trial:${orgId}`,
      planId: 'pro',
      status: 'trialing',
      trialEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    await sendReverseTrialWarnings();
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});
