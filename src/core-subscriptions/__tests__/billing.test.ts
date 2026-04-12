import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock ALL external dependencies BEFORE imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('@/core/lib/infra/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

vi.mock('@/core/lib/api/trpc-rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/core/policy', () => ({
  Policy: {
    for: vi.fn().mockReturnValue({
      canAccessAdmin: vi.fn().mockReturnValue(true),
      can: vi.fn().mockReturnValue(true),
    }),
  },
  Role: {
    USER: 'user',
    EDITOR: 'editor',
    ADMIN: 'admin',
    SUPERADMIN: 'superadmin',
  },
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/core/crud/admin-crud', () => ({
  buildAdminList: vi.fn().mockResolvedValue({
    results: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  }),
  buildStatusCounts: vi.fn().mockResolvedValue({
    all: 0,
    published: 0,
    draft: 0,
    scheduled: 0,
    trashed: 0,
  }),
  ensureSlugUnique: vi.fn().mockResolvedValue(undefined),
  softDelete: vi.fn().mockResolvedValue(undefined),
  softRestore: vi.fn().mockResolvedValue(undefined),
  permanentDelete: vi.fn().mockResolvedValue(undefined),
  fetchOrNotFound: vi.fn(),
  updateContentStatus: vi.fn().mockResolvedValue(undefined),
  generateCopySlug: vi.fn().mockResolvedValue('slug-copy'),
  getTranslationSiblings: vi.fn().mockResolvedValue([]),
  serializeExport: vi.fn().mockReturnValue({ data: '[]', contentType: 'application/json' }),
  prepareTranslationCopy: vi.fn().mockResolvedValue({ slug: 'slug-en', translationGroup: 'group-1', previewToken: 'tok' }),
  parsePagination: vi.fn().mockImplementation((input: { page?: number; pageSize?: number }) => {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 100;
    return { page, pageSize, offset: (page - 1) * pageSize };
  }),
  paginatedResult: vi.fn().mockImplementation(
    (items: unknown[], total: number, page: number, pageSize: number) => ({
      results: items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  ),
}));

vi.mock('@/core/lib/infra/audit', () => ({
  logAudit: vi.fn(),
}));

// Note: core-payments factory is no longer imported by billing.ts.
// Payment capabilities are accessed through getSubscriptionsDeps() DI.

// Mock subscription service
vi.mock('@/core-subscriptions/lib/subscription-service', () => ({
  getSubscription: vi.fn().mockResolvedValue(null),
}));

// Mock discount service
vi.mock('@/core-subscriptions/lib/discount-service', () => ({
  validateCode: vi.fn().mockResolvedValue({ valid: true, finalPriceCents: 1000 }),
  applyDiscount: vi.fn().mockResolvedValue({
    discount: { type: 'percentage', value: 10 },
    usageId: 'usage-1',
    discountCodeId: 'code-1',
  }),
  removeDiscount: vi.fn().mockResolvedValue(undefined),
  getActiveDiscount: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/core/lib/infra/stats-cache', () => ({
  getStats: vi.fn().mockImplementation((_key: string, fetchFn: () => Promise<unknown>) => fetchFn()),
}));

// Inline plan data inside deps mock
const mockPlans = [
  {
    id: 'free',
    name: 'Free',
    description: 'Free plan',
    providerPrices: {},
    priceMonthly: 0,
    priceYearly: 0,
    features: { maxMembers: 1, maxStorageMb: 100, customDomain: false, apiAccess: false, prioritySupport: false },
    displayFeatures: ['1 member'],
    cta: 'Get Started',
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Pro plan',
    providerPrices: {
      stripe: { monthly: 'price_pro_monthly', yearly: 'price_pro_yearly' },
    },
    priceMonthly: 4900,
    priceYearly: 49000,
    trialDays: 14,
    features: { maxMembers: 20, maxStorageMb: 10240, customDomain: true, apiAccess: true, prioritySupport: false },
    displayFeatures: ['20 members'],
    cta: 'Start Trial',
    popular: true,
  },
];
const mockBillingDeps = {
  getPlans: () => mockPlans,
  getPlan: (id: string) => mockPlans.find((p: { id: string }) => p.id === id),
  getPlanByProviderPriceId: (_providerId: string, priceId: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPlans.find((p: any) => {
      const prices = p.providerPrices?.['stripe'];
      if (!prices) return false;
      return prices.monthly === priceId || prices.yearly === priceId;
    }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getProviderPriceId: (plan: any, providerId: string, interval: string) => {
    const prices = plan.providerPrices?.[providerId];
    if (!prices) return null;
    return prices[interval] ?? null;
  },
  getEnabledProviderConfigs: () => [],
  resolveOrgId: vi.fn().mockResolvedValue('org-1'),
  sendOrgNotification: vi.fn(),
  enqueueTemplateEmail: vi.fn().mockResolvedValue(undefined),
  broadcastEvent: vi.fn(),
  // Cross-module payment deps (via DI)
  getProvider: vi.fn().mockResolvedValue(null),
  isBillingEnabled: vi.fn().mockReturnValue(false),
  getEnabledProviders: vi.fn().mockReturnValue([]),
  getTransactionRevenue: vi.fn().mockResolvedValue(0),
  getRecentTransactions: vi.fn().mockResolvedValue([]),
  getRevenueOverTime: vi.fn().mockResolvedValue([]),
  runReconciliation: vi.fn().mockResolvedValue(undefined),
};
vi.mock('@/core-subscriptions/deps', () => ({
  getSubscriptionsDeps: () => mockBillingDeps,
  setSubscriptionsDeps: vi.fn(),
}));

vi.mock('@/server/db/schema', () => ({
  member: {
    organizationId: 'member.organization_id',
    userId: 'member.user_id',
    role: 'member.role',
  },
  saasSubscriptions: {
    id: 'saas_subscriptions.id',
    organizationId: 'saas_subscriptions.organization_id',
    planId: 'saas_subscriptions.plan_id',
    providerId: 'saas_subscriptions.provider_id',
    providerPriceId: 'saas_subscriptions.provider_price_id',
    status: 'saas_subscriptions.status',
    updatedAt: 'saas_subscriptions.updated_at',
  },
  saasPaymentTransactions: {
    id: 'saas_payment_transactions.id',
    createdAt: 'saas_payment_transactions.created_at',
  },
  saasDiscountCodes: {
    id: 'saas_discount_codes.id',
    isActive: 'saas_discount_codes.is_active',
  },
}));

vi.mock('@/lib/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    BETTER_AUTH_SECRET: 'test-secret',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    DEEPL_API_KEY: '',
  },
}));

vi.mock('@/server/lib/resolve-org', () => ({
  resolveOrgId: vi.fn().mockResolvedValue('org-1'),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { asMock } from '@/test-utils';
import { billingRouter } from '@/core-subscriptions/routers/billing';
import { getSubscription } from '@/core-subscriptions/lib/subscription-service';

import { createMockCtx } from '@/server/routers/__tests__/test-helpers';

// Convenience aliases for mocking payment deps (accessed via getSubscriptionsDeps())
const isBillingEnabled = mockBillingDeps.isBillingEnabled;
const getProvider = mockBillingDeps.getProvider;
const getEnabledProviders = mockBillingDeps.getEnabledProviders;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org-1';

const MOCK_MEMBER_OWNER = { organizationId: ORG_ID, userId: 'user-1', role: 'owner' };
const MOCK_MEMBER_REGULAR = { organizationId: ORG_ID, userId: 'user-1', role: 'member' };

const MOCK_SUBSCRIPTION = {
  id: 'sub-1',
  organizationId: ORG_ID,
  providerId: 'stripe',
  providerCustomerId: 'cus_123',
  providerSubscriptionId: 'sub_123',
  providerPriceId: 'price_pro_monthly',
  planId: 'pro',
  status: 'active',
  currentPeriodStart: new Date('2025-01-01'),
  currentPeriodEnd: new Date('2025-02-01'),
  cancelAtPeriodEnd: false,
  trialEnd: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const MOCK_PROVIDER = {
  config: {
    id: 'stripe',
    name: 'Stripe',
    allowedIntervals: ['monthly', 'yearly'] as Array<'monthly' | 'yearly'>,
  },
  createCheckout: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/pay/xxx', providerId: 'stripe' }),
  createPortalSession: vi.fn().mockResolvedValue('https://billing.stripe.com/session/xxx'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('billingRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBillingDeps.resolveOrgId.mockImplementation(async (activeOrgId: string | null) => {
      if (activeOrgId) return activeOrgId;
      throw new Error('No active organization selected');
    });
    asMock(isBillingEnabled).mockReturnValue(false);
    asMock(getProvider).mockResolvedValue(null);
    asMock(getSubscription).mockResolvedValue(null);
    // Reset MOCK_PROVIDER function mocks
    MOCK_PROVIDER.createCheckout.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/xxx', providerId: 'stripe' });
    MOCK_PROVIDER.createPortalSession.mockResolvedValue('https://billing.stripe.com/session/xxx');
  });

  // =========================================================================
  // getPlans
  // =========================================================================
  describe('getPlans', () => {
    it('returns all plans without providerPrices', async () => {
      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getPlans();

      expect(result).toHaveLength(mockPlans.length);
      for (const plan of result) {
        expect(plan).not.toHaveProperty('providerPrices');
      }
    });

    it('includes plan metadata (name, description, price, features)', async () => {
      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getPlans();

      const freePlan = result.find((p) => p.id === 'free');
      expect(freePlan).toBeDefined();
      expect(freePlan!.name).toBe('Free');
      expect(freePlan!.priceMonthly).toBe(0);
      expect(freePlan!.features.maxMembers).toBe(1);
    });
  });

  // =========================================================================
  // getProviders
  // =========================================================================
  describe('getProviders', () => {
    it('returns empty list when no providers configured', async () => {
      asMock(getEnabledProviders).mockReturnValue([]);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getProviders();

      expect(result).toEqual([]);
    });

    it('returns configured providers', async () => {
      asMock(getEnabledProviders).mockReturnValue([{ id: 'stripe', name: 'Stripe' }]);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getProviders();

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('stripe');
    });
  });

  // =========================================================================
  // getSubscription
  // =========================================================================
  describe('getSubscription', () => {
    it('throws BAD_REQUEST when no active org is selected', async () => {
      const ctx = createMockCtx({ activeOrganizationId: null });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.getSubscription()).rejects.toThrow('No active organization selected');
    });

    it('returns free plan default when no subscription exists', async () => {
      asMock(getSubscription).mockResolvedValue(null);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getSubscription();

      expect(result).toEqual({ planId: 'free', status: 'active' });
    });

    it('returns existing subscription data', async () => {
      asMock(getSubscription).mockResolvedValue(MOCK_SUBSCRIPTION);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getSubscription();

      expect(result).toEqual(MOCK_SUBSCRIPTION);
    });
  });

  // =========================================================================
  // createCheckoutSession
  // =========================================================================
  describe('createCheckoutSession', () => {
    const checkoutInput = {
      planId: 'pro',
      interval: 'monthly' as const,
      providerId: 'stripe',
    };

    it('throws PRECONDITION_FAILED when billing is not configured', async () => {
      asMock(isBillingEnabled).mockReturnValue(false);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.createCheckoutSession(checkoutInput)).rejects.toThrow('Billing is not configured');
    });

    it('throws BAD_REQUEST when provider is unavailable', async () => {
      asMock(isBillingEnabled).mockReturnValue(true);
      asMock(getProvider).mockResolvedValue(null);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.createCheckoutSession(checkoutInput)).rejects.toThrow(
        'Payment provider "stripe" is not available'
      );
    });

    it('throws BAD_REQUEST when no active org is selected', async () => {
      asMock(isBillingEnabled).mockReturnValue(true);
      asMock(getProvider).mockResolvedValue(MOCK_PROVIDER as never);

      const ctx = createMockCtx({ activeOrganizationId: null });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.createCheckoutSession(checkoutInput)).rejects.toThrow(
        'No active organization selected'
      );
    });

    it('throws FORBIDDEN when user is not org owner/admin', async () => {
      asMock(isBillingEnabled).mockReturnValue(true);
      asMock(getProvider).mockResolvedValue(MOCK_PROVIDER as never);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_MEMBER_REGULAR]);

      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.createCheckoutSession(checkoutInput)).rejects.toThrow(
        'Only org owners/admins can manage billing'
      );
    });

    it('throws NOT_FOUND when plan does not exist', async () => {
      asMock(isBillingEnabled).mockReturnValue(true);
      asMock(getProvider).mockResolvedValue(MOCK_PROVIDER as never);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_MEMBER_OWNER]);

      const caller = billingRouter.createCaller(ctx as never);

      await expect(
        caller.createCheckoutSession({ ...checkoutInput, planId: 'nonexistent' })
      ).rejects.toThrow('Plan not found');
    });

    it('creates a checkout session and returns redirect URL for org owner', async () => {
      asMock(isBillingEnabled).mockReturnValue(true);
      asMock(getProvider).mockResolvedValue(MOCK_PROVIDER as never);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_MEMBER_OWNER]);

      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.createCheckoutSession(checkoutInput);

      expect(result.url).toBe('https://checkout.stripe.com/pay/xxx');
      expect(result.providerId).toBe('stripe');
      expect(MOCK_PROVIDER.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          planId: 'pro',
          interval: 'monthly',
        })
      );
    });

    it('throws BAD_REQUEST when interval is not allowed by provider', async () => {
      asMock(isBillingEnabled).mockReturnValue(true);

      const yearlyOnlyProvider = {
        ...MOCK_PROVIDER,
        config: { ...MOCK_PROVIDER.config, allowedIntervals: ['yearly' as const] },
      };
      asMock(getProvider).mockResolvedValue(yearlyOnlyProvider as never);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(
        caller.createCheckoutSession({ ...checkoutInput, interval: 'monthly' })
      ).rejects.toThrow('only supports yearly billing');
    });

    it('creates checkout for org admin (not just owner)', async () => {
      asMock(isBillingEnabled).mockReturnValue(true);
      asMock(getProvider).mockResolvedValue(MOCK_PROVIDER as never);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      ctx.db._chains.select.limit.mockResolvedValue([{ ...MOCK_MEMBER_OWNER, role: 'admin' }]);

      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.createCheckoutSession(checkoutInput);

      expect(result.url).toBeDefined();
    });
  });

  // =========================================================================
  // createPortalSession
  // =========================================================================
  describe('createPortalSession', () => {
    it('throws PRECONDITION_FAILED when provider has no portal support', async () => {
      asMock(getProvider).mockResolvedValue({ config: { id: 'nowpayments', name: 'NOWPayments' } } as never);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.createPortalSession({})).rejects.toThrow(
        'Portal session not supported for this provider'
      );
    });

    it('throws PRECONDITION_FAILED when provider is not found', async () => {
      asMock(getProvider).mockResolvedValue(null);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.createPortalSession({})).rejects.toThrow(
        'Portal session not supported for this provider'
      );
    });

    it('throws BAD_REQUEST when no active org is selected', async () => {
      asMock(getProvider).mockResolvedValue(MOCK_PROVIDER as never);

      const ctx = createMockCtx({ activeOrganizationId: null });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.createPortalSession({})).rejects.toThrow(
        'No active organization selected'
      );
    });

    it('returns portal URL for valid org', async () => {
      asMock(getProvider).mockResolvedValue(MOCK_PROVIDER as never);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.createPortalSession({});

      expect(result.url).toBe('https://billing.stripe.com/session/xxx');
      expect(MOCK_PROVIDER.createPortalSession).toHaveBeenCalledWith(
        ORG_ID,
        expect.stringContaining('/dashboard/settings/billing')
      );
    });
  });

  // =========================================================================
  // getStats
  // =========================================================================
  describe('getStats', () => {
    /**
     * Helper: build a select mock for getStats.
     *
     * getStats makes 8 sequential DB calls:
     *  1. planDistribution       (.select.from.where.groupBy)
     *  2. activeSubGroups (MRR)  (.select.from.where.groupBy)
     *  3. trialing count         (.select.from.where)
     *  4. canceled30d count      (.select.from.where)
     *  5. pastDue count          (.select.from.where)
     *  6. unpaid count           (.select.from.where)
     *  7. totalEver count        (.select.from — no where!)
     *  8. activeDiscountCodes    (.select.from.where)
     *  Note: totalRevenue + recentTransactions now come from DI deps, not DB.
     */
    function buildStatsDb(responses: unknown[][]) {
      let callIndex = 0;
      const selectMock = vi.fn().mockImplementation(() => {
        const rows = responses[callIndex] ?? [];
        callIndex++;

        const groupByMock = vi.fn().mockResolvedValue(rows);
        const limitMock = vi.fn().mockResolvedValue(rows);
        const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });

        const makeThenable = () => ({
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
          groupBy: groupByMock,
          orderBy: orderByMock,
          limit: limitMock,
        });
        const whereMock = vi.fn().mockImplementation(makeThenable);
        const leftJoinMock = vi.fn().mockReturnValue({ orderBy: orderByMock, where: whereMock });

        const fromMock = vi.fn().mockReturnValue({
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
          where: whereMock,
          orderBy: orderByMock,
          leftJoin: leftJoinMock,
        });

        return { from: fromMock };
      });

      return { select: selectMock, insert: vi.fn(), update: vi.fn(), delete: vi.fn() };
    }

    /** Standard 8-response array for getStats with zero values */
    const ZERO_STATS: unknown[][] = [
      [],             // 1. planDistribution
      [],             // 2. activeSubGroups
      [{ count: 0 }], // 3. trialing
      [{ count: 0 }], // 4. canceled30d
      [{ count: 0 }], // 5. pastDue
      [{ count: 0 }], // 6. unpaid
      [{ count: 0 }], // 7. totalEver
      [{ count: 0 }], // 8. activeDiscountCodes
    ];

    it('returns billing stats with expected shape', async () => {
      const responses = [...ZERO_STATS];
      responses[0] = [{ planId: 'pro', count: 2 }, { planId: 'free', count: 5 }];
      responses[1] = [{ planId: 'pro', providerId: 'stripe', providerPriceId: 'price_pro_monthly', count: 2 }];
      responses[3] = [{ count: 1 }]; // canceled30d
      responses[7] = [{ count: 3 }]; // activeDiscountCodes

      const db = buildStatsDb(responses);
      const ctx = createMockCtx({ db });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getStats();

      expect(result).toMatchObject({
        totalActive: 7,
        planDistribution: expect.arrayContaining([
          expect.objectContaining({ planId: 'pro', count: 2 }),
        ]),
        churn: expect.objectContaining({ canceled30d: 1 }),
        recentTransactions: [],
        activeDiscountCodes: 3,
      });
      expect(typeof result.mrr).toBe('number');
    });

    it('calculates MRR correctly for monthly subscribers', async () => {
      const responses = [...ZERO_STATS];
      responses[0] = [{ planId: 'pro', count: 2 }];
      responses[1] = [{ planId: 'pro', providerId: 'stripe', providerPriceId: 'price_pro_monthly', count: 2 }];

      const db = buildStatsDb(responses);
      const ctx = createMockCtx({ db });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getStats();

      expect(result.mrr).toBe(9800); // 2 × 4900 cents
    });

    it('calculates MRR correctly for yearly subscribers (divided by 12)', async () => {
      const responses = [...ZERO_STATS];
      responses[0] = [{ planId: 'pro', count: 1 }];
      responses[1] = [{ planId: 'pro', providerId: 'stripe', providerPriceId: 'price_pro_yearly', count: 1 }];

      const db = buildStatsDb(responses);
      const ctx = createMockCtx({ db });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getStats();

      expect(result.mrr).toBe(Math.round(49000 / 12)); // 4083 cents
    });

    it('returns zero MRR when no active subscriptions', async () => {
      const db = buildStatsDb([...ZERO_STATS]);
      const ctx = createMockCtx({ db });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getStats();

      expect(result.mrr).toBe(0);
      expect(result.totalActive).toBe(0);
    });
  });
});
