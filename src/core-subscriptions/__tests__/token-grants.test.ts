import { describe, it, expect, vi, beforeEach } from 'vitest';

const { addTokensMock, deductTokensMock, getTokenBalanceMock, expirePlanTokensMock, sendOrgNotificationMock, runHookMock, claimedRowsRef } = vi.hoisted(() => ({
  addTokensMock: vi.fn().mockResolvedValue(100),
  deductTokensMock: vi.fn().mockResolvedValue(0),
  getTokenBalanceMock: vi.fn().mockResolvedValue(0),
  expirePlanTokensMock: vi.fn().mockResolvedValue(0),
  sendOrgNotificationMock: vi.fn(),
  runHookMock: vi.fn(),
  // Result of the lastGrantPeriodKey compare-and-set claim (empty = lost the race)
  claimedRowsRef: { current: [{ id: 'sub-1' }] as Array<{ id: string }> },
}));

// db mock: transaction(cb) runs cb with a tx exposing the claim-update chain
vi.mock('@/server/db', () => {
  const txMock = {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(claimedRowsRef.current)),
        })),
      })),
    })),
  };
  return {
    db: {
      transaction: (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock),
    },
  };
});
vi.mock('@/core-subscriptions/schema/subscriptions', () => ({ saasSubscriptions: {}, saasTokenTransactions: {} }));
vi.mock('@/core-subscriptions/lib/token-service', () => ({
  addTokens: addTokensMock,
  deductTokens: deductTokensMock,
  getTokenBalance: getTokenBalanceMock,
  expirePlanTokens: expirePlanTokensMock,
  expireDueTokenLots: vi.fn().mockResolvedValue(0),
  findOrgsWithDueLots: vi.fn().mockResolvedValue([]),
  broadcastTokenBalance: vi.fn(),
}));
vi.mock('@/core-subscriptions/deps', () => ({
  getSubscriptionsDeps: () => ({
    getPlan: (id: string) => ({ id, name: 'Pro', monthlyTokens: 1000 }),
    getPlans: () => [],
    sendOrgNotification: sendOrgNotificationMock,
  }),
}));
vi.mock('@/core/lib/module/module-hooks', () => ({ runHook: runHookMock }));
vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import {
  addMonthsClamped,
  computeDuePeriodKey,
  grantDueSubscriptionTokens,
  grantSignupBonusTokens,
  handleTokenPackWebhookEvent,
} from '@/core-subscriptions/lib/token-grants';
import { setBillingConfig, clearBillingConfig, getBillingConfig, getTokenPack } from '@/core-subscriptions/lib/billing-config';
import type { WebhookEvent } from '@/core-payments/types/payment';

beforeEach(() => {
  addTokensMock.mockClear();
  deductTokensMock.mockClear();
  getTokenBalanceMock.mockClear();
  getTokenBalanceMock.mockResolvedValue(0);
  expirePlanTokensMock.mockClear();
  sendOrgNotificationMock.mockClear();
  runHookMock.mockClear();
  claimedRowsRef.current = [{ id: 'sub-1' }];
  clearBillingConfig();
});

describe('addMonthsClamped', () => {
  it('adds plain months', () => {
    expect(addMonthsClamped(new Date('2026-03-15T10:00:00Z'), 2).toISOString())
      .toBe('2026-05-15T10:00:00.000Z');
  });

  it('clamps Jan 31 to Feb 28 in non-leap years', () => {
    expect(addMonthsClamped(new Date('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10))
      .toBe('2026-02-28');
  });

  it('clamps Jan 31 to Feb 29 in leap years', () => {
    expect(addMonthsClamped(new Date('2028-01-31T00:00:00Z'), 1).toISOString().slice(0, 10))
      .toBe('2028-02-29');
  });

  it('crosses year boundaries', () => {
    expect(addMonthsClamped(new Date('2026-11-30T00:00:00Z'), 3).toISOString().slice(0, 10))
      .toBe('2027-02-28');
  });
});

describe('computeDuePeriodKey', () => {
  it('returns null when the anchor is in the future', () => {
    expect(computeDuePeriodKey(new Date('2026-08-01T00:00:00Z'), new Date('2026-07-01T00:00:00Z'))).toBeNull();
  });

  it('returns the anchor date itself on activation day (k=0)', () => {
    expect(computeDuePeriodKey(new Date('2026-07-01T08:00:00Z'), new Date('2026-07-01T09:00:00Z')))
      .toBe('2026-07-01');
  });

  it('stays on the previous key until the monthly anniversary time passes', () => {
    const anchor = new Date('2026-01-15T14:00:00Z');
    // Feb 15 09:00 — anniversary time (14:00) not yet reached → still January's key
    expect(computeDuePeriodKey(anchor, new Date('2026-02-15T09:00:00Z'))).toBe('2026-01-15');
    // Feb 15 15:00 — anniversary passed → February's key is due
    expect(computeDuePeriodKey(anchor, new Date('2026-02-15T15:00:00Z'))).toBe('2026-02-15');
  });

  it('walks a yearly subscription month by month', () => {
    const anchor = new Date('2026-01-10T00:00:00Z');
    expect(computeDuePeriodKey(anchor, new Date('2026-04-20T00:00:00Z'))).toBe('2026-04-10');
    expect(computeDuePeriodKey(anchor, new Date('2026-12-31T00:00:00Z'))).toBe('2026-12-10');
  });

  it('handles month-end anchors with clamped schedule dates', () => {
    const anchor = new Date('2026-01-31T00:00:00Z');
    expect(computeDuePeriodKey(anchor, new Date('2026-03-01T00:00:00Z'))).toBe('2026-02-28');
  });
});

describe('billing config', () => {
  it('defaults to subscription mode with no packs', () => {
    expect(getBillingConfig()).toEqual({ mode: 'subscription' });
    expect(getTokenPack('anything')).toBeUndefined();
  });

  it('set/clear round-trips and resolves packs', () => {
    setBillingConfig({
      mode: 'tokens',
      tokenPacks: [{ id: 'p1', name: 'P1', tokens: 500, priceCents: 500 }],
    });
    expect(getBillingConfig().mode).toBe('tokens');
    expect(getTokenPack('p1')?.tokens).toBe(500);
    clearBillingConfig();
    expect(getBillingConfig().mode).toBe('subscription');
  });
});

describe('grantDueSubscriptionTokens', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const daysFromNow = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

  const yearlySub = () => ({
    id: 'sub-1',
    organizationId: 'org-1',
    planId: 'pro',
    interval: null,
    status: 'active',
    currentPeriodStart: daysAgo(40),
    currentPeriodEnd: daysFromNow(325),
    createdAt: daysAgo(40),
    lastGrantPeriodKey: null,
  });

  it('drips monthlyTokens for yearly subscriptions by default', async () => {
    const granted = await grantDueSubscriptionTokens(yearlySub());
    expect(granted).toBe(true);
    expect(addTokensMock).toHaveBeenCalledTimes(1);
    const [, amount, , , opts] = addTokensMock.mock.calls[0]!;
    expect(amount).toBe(1000);
    expect((opts as { bucket: string }).bucket).toBe('plan');
  });

  it('grants monthlyTokens × 12 up front when yearlyTokenGrant is upfront', async () => {
    setBillingConfig({ mode: 'subscription-tokens', yearlyTokenGrant: 'upfront' });
    const sub = yearlySub();
    await grantDueSubscriptionTokens(sub);
    expect(addTokensMock).toHaveBeenCalledTimes(1);
    const [, amount, reason, metadata] = addTokensMock.mock.calls[0]!;
    expect(amount).toBe(12_000);
    expect(reason).toBe('subscription_grant');
    // keyed by the yearly period start, so the whole year is one grant
    expect((metadata as Record<string, unknown>).periodKey)
      .toBe(sub.currentPeriodStart.toISOString().slice(0, 10));
  });

  it('upfront mode leaves monthly-interval subscriptions on the monthly drip', async () => {
    setBillingConfig({ mode: 'subscription-tokens', yearlyTokenGrant: 'upfront' });
    await grantDueSubscriptionTokens({
      ...yearlySub(),
      currentPeriodStart: daysAgo(5),
      currentPeriodEnd: daysFromNow(25),
      createdAt: daysAgo(5),
    });
    expect(addTokensMock).toHaveBeenCalledTimes(1);
    expect(addTokensMock.mock.calls[0]![1]).toBe(1000);
  });

  it('trusts the stored interval over the period-length heuristic', async () => {
    setBillingConfig({ mode: 'subscription-tokens', yearlyTokenGrant: 'upfront' });
    // Long period but explicitly monthly → stays on the 1,000 drip
    await grantDueSubscriptionTokens({ ...yearlySub(), interval: 'monthly' });
    expect(addTokensMock.mock.calls[0]![1]).toBe(1000);
  });

  it('attaches an expiry when planTokenValidityMonths is set', async () => {
    setBillingConfig({ mode: 'subscription-tokens', planTokenValidityMonths: 3 });
    await grantDueSubscriptionTokens(yearlySub());
    const opts = addTokensMock.mock.calls[0]![4] as { expiresAt?: Date };
    expect(opts.expiresAt).toBeInstanceOf(Date);
    const monthsOut = (opts.expiresAt!.getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000);
    expect(monthsOut).toBeGreaterThan(2.5);
    expect(monthsOut).toBeLessThan(3.5);
  });

  it('skips when the due periodKey was already granted', async () => {
    const sub = yearlySub();
    const granted = await grantDueSubscriptionTokens({
      ...sub,
      lastGrantPeriodKey: computeDuePeriodKey(sub.currentPeriodStart, new Date()),
    });
    expect(granted).toBe(false);
    expect(addTokensMock).not.toHaveBeenCalled();
  });

  it('skips when losing the claim race (concurrent webhook + cron)', async () => {
    claimedRowsRef.current = [];
    const granted = await grantDueSubscriptionTokens(yearlySub());
    expect(granted).toBe(false);
    expect(addTokensMock).not.toHaveBeenCalled();
    expect(sendOrgNotificationMock).not.toHaveBeenCalled();
  });

  it('expires the plan bucket before granting when resetBalanceOnGrant is set', async () => {
    setBillingConfig({ mode: 'subscription-tokens', resetBalanceOnGrant: true });
    await grantDueSubscriptionTokens(yearlySub());
    expect(expirePlanTokensMock).toHaveBeenCalledTimes(1);
    expect(addTokensMock).toHaveBeenCalledTimes(1);
  });
});

describe('grantSignupBonusTokens', () => {
  it('is a no-op when unconfigured or orgId is null', async () => {
    await grantSignupBonusTokens('org-1');
    setBillingConfig({ mode: 'subscription-tokens', signupBonusTokens: 100 });
    await grantSignupBonusTokens(null);
    expect(addTokensMock).not.toHaveBeenCalled();
  });

  it('grants the configured bonus into the purchased bucket', async () => {
    setBillingConfig({ mode: 'subscription-tokens', signupBonusTokens: 100 });
    await grantSignupBonusTokens('org-1');
    expect(addTokensMock).toHaveBeenCalledWith('org-1', 100, 'bonus', { grant: 'signup' }, { bucket: 'purchased' });
  });
});

describe('handleTokenPackWebhookEvent', () => {
  const packConfig = {
    mode: 'tokens' as const,
    tokenPacks: [{ id: 'pack-1', name: 'Starter Pack', tokens: 1000, priceCents: 900 }],
  };

  const completedEvent = (metadata: Record<string, string>): WebhookEvent => ({
    type: 'payment.completed',
    providerData: { _eventId: 'evt_1', metadata },
  });

  it('credits the pack into the purchased bucket and notifies', async () => {
    setBillingConfig(packConfig);
    const result = await handleTokenPackWebhookEvent({
      event: completedEvent({ type: 'token_pack', packId: 'pack-1', orgId: 'org-1', userId: 'user-1' }),
      providerId: 'stripe',
    });
    expect(result.credited).toBe(true);
    expect(addTokensMock).toHaveBeenCalledWith(
      'org-1',
      1000,
      'purchase',
      { packId: 'pack-1', providerId: 'stripe', eventId: 'evt_1' },
      { bucket: 'purchased' },
    );
    expect(sendOrgNotificationMock).toHaveBeenCalled();
    expect(runHookMock).toHaveBeenCalledWith('payment.conversion', 'user-1', 'token_pack:pack-1', 900);
  });

  it('ignores non-completed events', async () => {
    setBillingConfig(packConfig);
    const result = await handleTokenPackWebhookEvent({
      event: { type: 'payment.failed', providerData: { metadata: { packId: 'pack-1', orgId: 'org-1' } } },
      providerId: 'stripe',
    });
    expect(result.credited).toBe(false);
    expect(addTokensMock).not.toHaveBeenCalled();
  });

  it('claws back on refund, clamped to the remaining balance', async () => {
    setBillingConfig(packConfig);
    getTokenBalanceMock.mockResolvedValue(600); // 400 of the 1000 already spent
    const result = await handleTokenPackWebhookEvent({
      event: {
        type: 'payment.refunded',
        providerData: { _eventId: 'evt_r', metadata: { type: 'token_pack', packId: 'pack-1', orgId: 'org-1' } },
      },
      providerId: 'stripe',
    });
    expect(result.credited).toBe(false);
    expect(deductTokensMock).toHaveBeenCalledWith(
      'org-1',
      600,
      'refund',
      {
        packId: 'pack-1',
        providerId: 'stripe',
        eventId: 'evt_r',
      },
      { clamp: true, spendOrder: 'purchased-first' },
    );
    expect(sendOrgNotificationMock).toHaveBeenCalled();
  });

  it('refund with zero balance deducts nothing', async () => {
    setBillingConfig(packConfig);
    getTokenBalanceMock.mockResolvedValue(0);
    await handleTokenPackWebhookEvent({
      event: {
        type: 'payment.refunded',
        providerData: { metadata: { type: 'token_pack', packId: 'pack-1', orgId: 'org-1' } },
      },
      providerId: 'stripe',
    });
    expect(deductTokensMock).not.toHaveBeenCalled();
  });

  it('refuses unknown packs', async () => {
    setBillingConfig(packConfig);
    // Throws (not a quiet no-op): the customer paid for a pack the config
    // no longer knows — that must surface as a webhook failure, not silence.
    await expect(
      handleTokenPackWebhookEvent({
        event: completedEvent({ type: 'token_pack', packId: 'ghost', orgId: 'org-1' }),
        providerId: 'stripe',
      }),
    ).rejects.toThrow('not found in billing config');
    expect(addTokensMock).not.toHaveBeenCalled();
  });
});
