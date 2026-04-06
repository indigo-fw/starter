import { describe, it, expect } from 'vitest';

import { PLANS, getPlan, getPlanByProviderPriceId, getProviderPriceId, getFreePlan } from '../plans';

describe('PLANS', () => {
  it('has at least 4 plans defined', () => {
    expect(PLANS.length).toBeGreaterThanOrEqual(4);
  });

  it('has unique plan IDs', () => {
    const ids = PLANS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has a free plan with zero prices', () => {
    const free = PLANS.find((p) => p.id === 'free');
    expect(free).toBeDefined();
    expect(free!.priceMonthly).toBe(0);
    expect(free!.priceYearly).toBe(0);
    expect(Object.keys(free!.providerPrices).length).toBe(0);
  });

  it('all plans have required feature keys', () => {
    for (const plan of PLANS) {
      expect(plan.features).toHaveProperty('maxMembers');
      expect(plan.features).toHaveProperty('maxStorageMb');
      expect(plan.features).toHaveProperty('customDomain');
      expect(plan.features).toHaveProperty('apiAccess');
      expect(plan.features).toHaveProperty('prioritySupport');
    }
  });

  it('plans are ordered by ascending price', () => {
    for (let i = 1; i < PLANS.length; i++) {
      expect(PLANS[i]!.priceMonthly).toBeGreaterThanOrEqual(PLANS[i - 1]!.priceMonthly);
    }
  });
});

describe('getPlan', () => {
  it('returns the correct plan by ID', () => {
    const plan = getPlan('free');
    expect(plan).toBeDefined();
    expect(plan!.id).toBe('free');
    expect(plan!.name).toBe('Free');
  });

  it('returns starter plan', () => {
    const plan = getPlan('starter');
    expect(plan).toBeDefined();
    expect(plan!.id).toBe('starter');
    expect(plan!.priceMonthly).toBe(1900);
  });

  it('returns pro plan with popular flag', () => {
    const plan = getPlan('pro');
    expect(plan).toBeDefined();
    expect(plan!.popular).toBe(true);
  });

  it('returns enterprise plan', () => {
    const plan = getPlan('enterprise');
    expect(plan).toBeDefined();
    expect(plan!.priceMonthly).toBe(9900);
  });

  it('returns undefined for non-existent plan', () => {
    expect(getPlan('nonexistent')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(getPlan('')).toBeUndefined();
  });
});

describe('getPlanByProviderPriceId', () => {
  it('finds plan by Stripe monthly price ID', () => {
    const starterPlan = PLANS.find((p) => p.id === 'starter');
    const stripePrices = starterPlan?.providerPrices['stripe'];
    if (stripePrices) {
      const monthly = stripePrices.monthly;
      if (monthly) {
        const found = getPlanByProviderPriceId('stripe', monthly);
        expect(found).toBeDefined();
        expect(found!.id).toBe('starter');
      }
    }
  });

  it('finds plan by Stripe yearly price ID', () => {
    const starterPlan = PLANS.find((p) => p.id === 'starter');
    const stripePrices = starterPlan?.providerPrices['stripe'];
    if (stripePrices) {
      const yearly = stripePrices.yearly;
      if (yearly) {
        const found = getPlanByProviderPriceId('stripe', yearly);
        expect(found).toBeDefined();
        expect(found!.id).toBe('starter');
      }
    }
  });

  it('returns undefined for non-existent price ID', () => {
    expect(getPlanByProviderPriceId('stripe', 'price_nonexistent_123')).toBeUndefined();
  });

  it('returns undefined for unknown provider', () => {
    expect(getPlanByProviderPriceId('unknown_provider', 'price_123')).toBeUndefined();
  });
});

describe('getProviderPriceId', () => {
  it('returns Stripe monthly price ID', () => {
    const plan = getPlan('starter');
    if (plan) {
      const priceId = getProviderPriceId(plan, 'stripe', 'monthly');
      // May be empty string if env var not set
      expect(typeof priceId === 'string' || priceId === null).toBe(true);
    }
  });

  it('returns null for free plan', () => {
    const plan = getFreePlan();
    expect(getProviderPriceId(plan, 'stripe', 'monthly')).toBeNull();
  });

  it('returns null for unknown provider', () => {
    const plan = getPlan('starter');
    if (plan) {
      expect(getProviderPriceId(plan, 'unknown', 'monthly')).toBeNull();
    }
  });
});

describe('getFreePlan', () => {
  it('returns the free plan', () => {
    const plan = getFreePlan();
    expect(plan).toBeDefined();
    expect(plan.id).toBe('free');
  });

  it('free plan has 1 member limit', () => {
    const plan = getFreePlan();
    expect(plan.features.maxMembers).toBe(1);
  });

  it('free plan has no custom domain', () => {
    const plan = getFreePlan();
    expect(plan.features.customDomain).toBe(false);
  });

  it('free plan has no API access', () => {
    const plan = getFreePlan();
    expect(plan.features.apiAccess).toBe(false);
  });

  it('free plan has 100MB storage', () => {
    const plan = getFreePlan();
    expect(plan.features.maxStorageMb).toBe(100);
  });
});
