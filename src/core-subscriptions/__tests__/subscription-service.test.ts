import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock ALL external dependencies BEFORE imports
// ---------------------------------------------------------------------------

vi.mock('@/server/db', () => {
  const limitMock = vi.fn().mockResolvedValue([]);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  const onConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined);
  const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
  const insertMock = vi.fn().mockReturnValue({ values: valuesMock });

  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const setMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: setMock });

  return {
    db: {
      select: selectMock,
      insert: insertMock,
      update: updateMock,
      // Expose chain refs for beforeEach resets
      _mocks: {
        select: selectMock, from: fromMock, where: whereMock, limit: limitMock,
        insert: insertMock, values: valuesMock, onConflictDoUpdate: onConflictDoUpdateMock,
        update: updateMock, set: setMock, updateWhere: updateWhereMock,
      },
    },
  };
});

vi.mock('@/core-subscriptions/schema/subscriptions', () => ({
  saasSubscriptions: {
    id: 'saas_subscriptions.id',
    organizationId: 'saas_subscriptions.organization_id',
    providerId: 'saas_subscriptions.provider_id',
    providerCustomerId: 'saas_subscriptions.provider_customer_id',
    providerSubscriptionId: 'saas_subscriptions.provider_subscription_id',
    providerPriceId: 'saas_subscriptions.provider_price_id',
    planId: 'saas_subscriptions.plan_id',
    status: 'saas_subscriptions.status',
    currentPeriodStart: 'saas_subscriptions.current_period_start',
    currentPeriodEnd: 'saas_subscriptions.current_period_end',
    cancelAtPeriodEnd: 'saas_subscriptions.cancel_at_period_end',
    trialEnd: 'saas_subscriptions.trial_end',
    createdAt: 'saas_subscriptions.created_at',
    updatedAt: 'saas_subscriptions.updated_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ _type: 'eq', val })),
  and: vi.fn((...conditions: unknown[]) => ({ _type: 'and', conditions })),
}));

vi.mock('@/core/lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { asMock } from '@/test-utils';
import {
  activateSubscription,
  updateSubscription,
  cancelSubscription,
} from '@/core-subscriptions/lib/subscription-service';
import { db } from '@/server/db';
import { eq, and } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Access mock chain via the imported db object (resilient to mock leakage)
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m = (db as any)._mocks as Record<string, ReturnType<typeof vi.fn>>;

function mockSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-uuid-1',
    organizationId: 'org-1',
    providerId: 'stripe',
    providerCustomerId: 'cus_123',
    providerSubscriptionId: 'sub_stripe_123',
    providerPriceId: 'price_pro_monthly',
    planId: 'pro',
    status: 'active',
    currentPeriodStart: new Date('2026-01-01'),
    currentPeriodEnd: new Date('2026-02-01'),
    cancelAtPeriodEnd: false,
    trialEnd: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('subscription-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-establish mock chains (bun's clearAllMocks clears return values)
    asMock(db.select).mockReturnValue({ from: m.from });
    m.from.mockReturnValue({ where: m.where });
    m.where.mockReturnValue({ limit: m.limit });
    m.limit.mockResolvedValue([]);

    asMock(db.insert).mockReturnValue({ values: m.values });
    m.values.mockReturnValue({ onConflictDoUpdate: m.onConflictDoUpdate });
    m.onConflictDoUpdate.mockResolvedValue(undefined);

    asMock(db.update).mockReturnValue({ set: m.set });
    m.set.mockReturnValue({ where: m.updateWhere });
    m.updateWhere.mockResolvedValue(undefined);
  });

  // NOTE: getSubscription and getOrgByProviderSubscription are trivial DB
  // wrappers — covered implicitly through billing.test.ts and feature-gate.test.ts.

  // =========================================================================
  // cancelSubscription
  // =========================================================================
  describe('cancelSubscription', () => {
    it('selects subscription before updating', async () => {
      await cancelSubscription('sub_stripe_123');
      // SELECT must happen to check cancelAtPeriodEnd
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(db.update).toHaveBeenCalledTimes(1);
    });

    it('sets status to "canceled" and planId to "free" when not cancel-at-period-end', async () => {
      // Default: m.limit returns [] → sub is undefined → planId: 'free'
      await cancelSubscription('sub_stripe_123');
      expect(m.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'canceled', planId: 'free', updatedAt: expect.any(Date) }),
      );
    });

    it('keeps current plan when cancelAtPeriodEnd is true and period has not ended', async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      m.limit.mockResolvedValue([mockSub({ cancelAtPeriodEnd: true, currentPeriodEnd: futureDate })]);

      await cancelSubscription('sub_stripe_123');
      const setArg = asMock(m.set).mock.calls[0]![0] as Record<string, unknown>;
      expect(setArg.status).toBe('canceled');
      expect(setArg).not.toHaveProperty('planId');
    });

    it('downgrades to free when cancelAtPeriodEnd is true but period already ended', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      m.limit.mockResolvedValue([mockSub({ cancelAtPeriodEnd: true, currentPeriodEnd: pastDate })]);

      await cancelSubscription('sub_stripe_123');
      expect(m.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'canceled', planId: 'free' }),
      );
    });

    it('filters both SELECT and UPDATE by providerSubscriptionId', async () => {
      await cancelSubscription('sub_stripe_789');
      // eq called twice: once for SELECT WHERE, once for UPDATE WHERE
      expect(eq).toHaveBeenCalledTimes(2);
      expect(eq).toHaveBeenNthCalledWith(1, 'saas_subscriptions.provider_subscription_id', 'sub_stripe_789');
      expect(eq).toHaveBeenNthCalledWith(2, 'saas_subscriptions.provider_subscription_id', 'sub_stripe_789');
    });
  });

  // =========================================================================
  // updateSubscription
  // =========================================================================
  describe('updateSubscription', () => {
    it('updates planId when provided', async () => {
      await updateSubscription('sub_stripe_123', { planId: 'enterprise' });
      expect(m.set).toHaveBeenCalledWith(
        expect.objectContaining({ planId: 'enterprise', updatedAt: expect.any(Date) }),
      );
    });

    it('updates status when provided', async () => {
      await updateSubscription('sub_stripe_123', { status: 'past_due' });
      expect(m.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'past_due', updatedAt: expect.any(Date) }),
      );
    });

    it('updates period dates when provided', async () => {
      const periodStart = new Date('2026-03-01');
      const periodEnd = new Date('2026-04-01');
      await updateSubscription('sub_stripe_123', { periodStart, periodEnd });
      expect(m.set).toHaveBeenCalledWith(
        expect.objectContaining({
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('does not include undefined fields in the set object', async () => {
      await updateSubscription('sub_stripe_123', { planId: 'pro' });
      const setArg = asMock(m.set).mock.calls[0][0];
      expect(setArg).toHaveProperty('planId', 'pro');
      expect(setArg).toHaveProperty('updatedAt');
      expect(setArg).not.toHaveProperty('status');
      expect(setArg).not.toHaveProperty('currentPeriodStart');
    });
  });

  // =========================================================================
  // activateSubscription
  // =========================================================================
  describe('activateSubscription', () => {
    describe('with providerSubscriptionId (upsert path)', () => {
      it('inserts with onConflictDoUpdate', async () => {
        await activateSubscription({
          organizationId: 'org-1',
          planId: 'pro',
          providerId: 'stripe',
          interval: 'monthly',
          providerCustomerId: 'cus_123',
          providerSubscriptionId: 'sub_stripe_123',
          providerPriceId: 'price_pro_monthly',
        });

        expect(m.values).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId: 'org-1',
            providerId: 'stripe',
            providerSubscriptionId: 'sub_stripe_123',
            planId: 'pro',
            status: 'active',
          }),
        );
        expect(m.onConflictDoUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            target: 'saas_subscriptions.provider_subscription_id',
            set: expect.objectContaining({ planId: 'pro', status: 'active' }),
          }),
        );
      });

      it('uses default status "active" when not provided', async () => {
        await activateSubscription({
          organizationId: 'org-1',
          planId: 'pro',
          providerId: 'stripe',
          interval: 'monthly',
          providerCustomerId: 'cus_123',
          providerSubscriptionId: 'sub_stripe_123',
        });
        expect(m.values).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
      });
    });

    describe('without providerSubscriptionId (crypto path)', () => {
      it('updates existing subscription when one is found', async () => {
        m.limit.mockResolvedValue([{ id: 'existing-sub-id' }]);

        await activateSubscription({
          organizationId: 'org-1',
          planId: 'pro',
          providerId: 'nowpayments',
          interval: 'monthly',
          providerCustomerId: 'cus_crypto_123',
        });

        // SELECT uses composite WHERE (org + provider)
        expect(and).toHaveBeenCalled();
        // UPDATE targets the existing row by id
        expect(m.set).toHaveBeenCalledWith(
          expect.objectContaining({ providerCustomerId: 'cus_crypto_123', planId: 'pro', status: 'active' }),
        );
        expect(m.updateWhere).toHaveBeenCalled();
        expect(eq).toHaveBeenCalledWith('saas_subscriptions.id', 'existing-sub-id');
      });

      it('inserts a new subscription when none exists', async () => {
        m.limit.mockResolvedValue([]);

        await activateSubscription({
          organizationId: 'org-1',
          planId: 'pro',
          providerId: 'nowpayments',
          interval: 'monthly',
          providerCustomerId: 'cus_crypto_456',
        });

        expect(m.values).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId: 'org-1',
            providerId: 'nowpayments',
            providerCustomerId: 'cus_crypto_456',
            planId: 'pro',
            status: 'active',
          }),
        );
      });

      it('sets null for optional fields when not provided', async () => {
        m.limit.mockResolvedValue([]);

        await activateSubscription({
          organizationId: 'org-1',
          planId: 'pro',
          providerId: 'nowpayments',
          interval: 'monthly',
          providerCustomerId: 'cus_crypto_000',
        });

        expect(m.values).toHaveBeenCalledWith(
          expect.objectContaining({
            providerPriceId: null,
            currentPeriodStart: null,
            currentPeriodEnd: null,
          }),
        );
      });
    });
  });
});
