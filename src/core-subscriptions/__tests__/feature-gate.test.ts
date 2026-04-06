import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

vi.mock('@/core-subscriptions/lib/subscription-service', () => ({
  getSubscription: vi.fn(),
}));

const FREE_PLAN = {
  id: 'free',
  name: 'Free',
  description: 'Free plan',
  providerPrices: {},
  priceMonthly: 0,
  priceYearly: 0,
  features: {
    maxMembers: 1,
    maxStorageMb: 100,
    customDomain: false,
    apiAccess: false,
    prioritySupport: false,
  },
};

const PRO_PLAN = {
  id: 'pro',
  name: 'Pro',
  description: 'Pro plan',
  providerPrices: {},
  priceMonthly: 4900,
  priceYearly: 49000,
  features: {
    maxMembers: 20,
    maxStorageMb: 10240,
    customDomain: true,
    apiAccess: true,
    prioritySupport: false,
  },
};

const MOCK_PLANS = [FREE_PLAN, PRO_PLAN];

import { asMock } from '@/test-utils';
import { getSubscription } from '@/core-subscriptions/lib/subscription-service';
import { setPlanResolver, getPlanFeatures, checkFeature, requireFeature } from '@/core-subscriptions/lib/feature-gate';

const FREE_FEATURES = FREE_PLAN.features;
const PRO_FEATURES = PRO_PLAN.features;

describe('feature-gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPlanResolver({
      getPlan: (id: string) => MOCK_PLANS.find((p) => p.id === id),
      getFreePlan: () => FREE_PLAN,
    });
  });

  describe('getPlanFeatures', () => {
    it('returns free plan features when no subscription exists', async () => {
      asMock(getSubscription).mockResolvedValue(null);

      const features = await getPlanFeatures('org-1');

      expect(features).toEqual(FREE_FEATURES);
      expect(getSubscription).toHaveBeenCalledWith('org-1');
    });

    it('returns plan features for active subscription', async () => {
      asMock(getSubscription).mockResolvedValue({
        id: 'sub-1',
        planId: 'pro',
        status: 'active',
      });

      const features = await getPlanFeatures('org-1');

      expect(features).toEqual(PRO_FEATURES);
    });

    it('returns free plan features for canceled subscription', async () => {
      asMock(getSubscription).mockResolvedValue({
        id: 'sub-1',
        planId: 'pro',
        status: 'canceled',
      });

      const features = await getPlanFeatures('org-1');

      expect(features).toEqual(FREE_FEATURES);
    });

    it('returns free plan features when plan not found', async () => {
      asMock(getSubscription).mockResolvedValue({
        id: 'sub-1',
        planId: 'nonexistent',
        status: 'active',
      });

      const features = await getPlanFeatures('org-1');

      expect(features).toEqual(FREE_FEATURES);
    });
  });

  describe('checkFeature', () => {
    it('returns allowed for a boolean feature that is true', async () => {
      asMock(getSubscription).mockResolvedValue({
        id: 'sub-1',
        planId: 'pro',
        status: 'active',
      });

      const result = await checkFeature('org-1', 'apiAccess');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('returns denied for a boolean feature that is false', async () => {
      asMock(getSubscription).mockResolvedValue(null);

      const result = await checkFeature('org-1', 'customDomain');

      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(false);
      expect(result.message).toBe('customDomain is not available on your current plan');
    });

    it('returns allowed when numeric value is under limit', async () => {
      asMock(getSubscription).mockResolvedValue(null);

      const result = await checkFeature('org-1', 'maxStorageMb', 50);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(100);
      expect(result.current).toBe(50);
      expect(result.message).toBeUndefined();
    });

    it('returns denied when numeric value is at limit', async () => {
      asMock(getSubscription).mockResolvedValue(null);

      const result = await checkFeature('org-1', 'maxMembers', 1);

      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(1);
      expect(result.current).toBe(1);
      expect(result.message).toBe(
        'You have reached the limit of 1 for maxMembers on your current plan',
      );
    });

    it('returns denied when numeric value is over limit', async () => {
      asMock(getSubscription).mockResolvedValue(null);

      const result = await checkFeature('org-1', 'maxMembers', 5);

      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(1);
      expect(result.current).toBe(5);
      expect(result.message).toBe(
        'You have reached the limit of 1 for maxMembers on your current plan',
      );
    });

    it('returns allowed for numeric feature when currentValue is not provided', async () => {
      asMock(getSubscription).mockResolvedValue(null);

      const result = await checkFeature('org-1', 'maxMembers');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(1);
    });
  });

  describe('requireFeature', () => {
    it('does not throw when boolean feature is allowed', async () => {
      asMock(getSubscription).mockResolvedValue({
        id: 'sub-1',
        planId: 'pro',
        status: 'active',
      });

      await expect(requireFeature('org-1', 'apiAccess')).resolves.toBeUndefined();
    });

    it('does not throw when numeric feature is under limit', async () => {
      asMock(getSubscription).mockResolvedValue({
        id: 'sub-1',
        planId: 'pro',
        status: 'active',
      });

      await expect(requireFeature('org-1', 'maxMembers', 10)).resolves.toBeUndefined();
    });

    it('throws TRPCError FORBIDDEN when boolean feature is denied', async () => {
      asMock(getSubscription).mockResolvedValue(null);

      try {
        await requireFeature('org-1', 'customDomain');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe('FORBIDDEN');
        expect((err as TRPCError).message).toBe(
          'customDomain is not available on your current plan',
        );
      }
    });

    it('throws TRPCError FORBIDDEN when numeric limit is exceeded', async () => {
      asMock(getSubscription).mockResolvedValue(null);

      try {
        await requireFeature('org-1', 'maxMembers', 5);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe('FORBIDDEN');
        expect((err as TRPCError).message).toBe(
          'You have reached the limit of 1 for maxMembers on your current plan',
        );
      }
    });
  });
});
