import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── DB mock that captures both the existing-row probe AND the insert's
// `.values()` payload, so we can assert call shape, not just call count.
// `vi.hoisted` runs before `vi.mock` hoisting so the factory can close over these refs.
const { existingRowsRef, valuesMock, insertMock } = vi.hoisted(() => {
  const existingRowsRef: { current: Array<{ id: string }> } = { current: [] };
  const valuesMock = vi.fn();
  const insertMock = vi.fn(() => ({ values: (v: unknown) => { valuesMock(v); return Promise.resolve(); } }));
  return { existingRowsRef, valuesMock, insertMock };
});

vi.mock('@/server/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(existingRowsRef.current)),
        })),
      })),
    })),
    insert: insertMock,
  },
}));
vi.mock('@/core-subscriptions/schema/subscriptions', () => ({ saasSubscriptions: {} }));
vi.mock('@/server/db/schema/organization', () => ({ member: {} }));
vi.mock('@/server/db/schema/auth', () => ({ user: {} }));
vi.mock('@/core/lib/infra/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }));
vi.mock('@/core/lib/email', () => ({ enqueueTemplateEmail: vi.fn() }));
vi.mock('@/core/lib/preferences', () => ({ getUserPref: vi.fn().mockResolvedValue(false), patchUserPrefs: vi.fn() }));
vi.mock('@/core-subscriptions/deps', () => ({ getSubscriptionsDeps: () => ({ getPlan: () => ({ name: 'Pro' }) }) }));

import {
  setReverseTrialConfig,
  clearReverseTrialConfig,
  getReverseTrialConfig,
  grantReverseTrialOnSignup,
} from '@/core-subscriptions/lib/reverse-trial';

beforeEach(() => {
  insertMock.mockClear();
  valuesMock.mockClear();
  existingRowsRef.current = [];
  clearReverseTrialConfig();
});

describe('reverse-trial config', () => {
  it('is unconfigured by default', () => {
    expect(getReverseTrialConfig()).toBeNull();
  });

  it('setReverseTrialConfig is reflected by getReverseTrialConfig; clear resets it', () => {
    setReverseTrialConfig({ plan: 'pro', days: 14 });
    expect(getReverseTrialConfig()).toEqual({ plan: 'pro', days: 14 });
    clearReverseTrialConfig();
    expect(getReverseTrialConfig()).toBeNull();
  });
});

describe('grantReverseTrialOnSignup guards', () => {
  it('no-op when reverse trial is not configured (even with a valid orgId)', async () => {
    await grantReverseTrialOnSignup('org-123');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('no-op when orgId is null (org creation failed upstream)', async () => {
    setReverseTrialConfig({ plan: 'pro', days: 14 });
    await grantReverseTrialOnSignup(null);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('no-op when org already has an active/trialing subscription (idempotency)', async () => {
    setReverseTrialConfig({ plan: 'pro', days: 14 });
    existingRowsRef.current = [{ id: 'sub-existing' }];
    await grantReverseTrialOnSignup('org-123');
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe('grantReverseTrialOnSignup — insert shape', () => {
  it('writes a trialing subscription with the configured plan + ~N-day trialEnd', async () => {
    setReverseTrialConfig({ plan: 'pro', days: 14 });
    const before = Date.now();
    await grantReverseTrialOnSignup('org-abc');
    const after = Date.now();

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledTimes(1);

    const v = valuesMock.mock.calls[0][0] as {
      id: string; organizationId: string; providerId: string; providerCustomerId: string;
      planId: string; status: string; currentPeriodStart: Date; currentPeriodEnd: Date; trialEnd: Date;
    };

    expect(v.organizationId).toBe('org-abc');
    expect(v.providerId).toBe('trial');
    expect(v.providerCustomerId).toBe('trial:org-abc');
    expect(v.planId).toBe('pro');
    expect(v.status).toBe('trialing');
    expect(v.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    // trialEnd is deterministic: `new Date()` captured between [before,after],
    // then setUTCDate(+14). Real delta should be within ms of 14 full days
    // (no DST involved with UTC), plus a generous slack for slow CI runners.
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const SLACK = 5000; // 5s: plenty for the synchronous code path
    const trialEndMs = v.trialEnd.getTime();
    expect(trialEndMs).toBeGreaterThanOrEqual(before + fourteenDaysMs - SLACK);
    expect(trialEndMs).toBeLessThanOrEqual(after + fourteenDaysMs + SLACK);
    expect(v.currentPeriodEnd.getTime()).toBe(trialEndMs);
    expect(v.currentPeriodStart.getTime()).toBeGreaterThanOrEqual(before);
    expect(v.currentPeriodStart.getTime()).toBeLessThanOrEqual(after);
  });

  it('uses the configured plan id verbatim', async () => {
    setReverseTrialConfig({ plan: 'enterprise-x', days: 7 });
    await grantReverseTrialOnSignup('org-xyz');
    const v = valuesMock.mock.calls[0][0] as { planId: string };
    expect(v.planId).toBe('enterprise-x');
  });
});
