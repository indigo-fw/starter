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

vi.mock('@/core/lib/audit', () => ({
  logAudit: vi.fn(),
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

vi.mock('@/core/crud/admin-crud', () => ({
  parsePagination: vi.fn().mockImplementation((input: { page?: number; pageSize?: number }) => {
    const page = input?.page ?? 1;
    const pageSize = input?.pageSize ?? 20;
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

vi.mock('@/core-affiliates/schema/affiliates', () => ({
  saasAffiliates: {
    id: 'saas_affiliates.id',
    userId: 'saas_affiliates.user_id',
    code: 'saas_affiliates.code',
    commissionPercent: 'saas_affiliates.commission_percent',
    status: 'saas_affiliates.status',
    totalReferrals: 'saas_affiliates.total_referrals',
    totalEarningsCents: 'saas_affiliates.total_earnings_cents',
    createdAt: 'saas_affiliates.created_at',
    updatedAt: 'saas_affiliates.updated_at',
  },
  saasReferrals: {
    id: 'saas_referrals.id',
    affiliateId: 'saas_referrals.affiliate_id',
    referredUserId: 'saas_referrals.referred_user_id',
    status: 'saas_referrals.status',
    convertedAt: 'saas_referrals.converted_at',
    createdAt: 'saas_referrals.created_at',
  },
  saasAffiliateEvents: {
    id: 'saas_affiliate_events.id',
    affiliateId: 'saas_affiliate_events.affiliate_id',
    referralId: 'saas_affiliate_events.referral_id',
    type: 'saas_affiliate_events.type',
    amountCents: 'saas_affiliate_events.amount_cents',
    metadata: 'saas_affiliate_events.metadata',
    createdAt: 'saas_affiliate_events.created_at',
  },
}));

vi.mock('@/server/db/schema/auth', () => ({
  user: {
    id: 'user.id',
    name: 'user.name',
    email: 'user.email',
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { affiliatesRouter } from '@/core-affiliates/routers/affiliates';
import { logAudit } from '@/core/lib/audit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Makes an object thenable so it can be used in Promise.all / await.
 * Drizzle query builders are thenable — `.where()` can be the terminal.
 */
function thenable(data: unknown, chainMethods: Record<string, unknown> = {}) {
  return {
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(data).then(resolve, reject),
    ...chainMethods,
  };
}

function createSelectChain(data: unknown) {
  const limitMock = vi.fn().mockResolvedValue(data);
  const offsetMock = vi.fn().mockReturnValue(thenable(data, { limit: limitMock }));
  const orderByMock = vi.fn().mockReturnValue(thenable(data, { limit: limitMock, offset: offsetMock }));
  const groupByMock = vi.fn().mockReturnValue(thenable(data, { orderBy: orderByMock }));
  const whereMock = vi.fn().mockReturnValue(
    thenable(data, {
      limit: limitMock,
      orderBy: orderByMock,
      offset: offsetMock,
      groupBy: groupByMock,
    })
  );
  const fromMock = vi.fn().mockReturnValue(
    thenable(data, {
      where: whereMock,
      orderBy: orderByMock,
      limit: limitMock,
      groupBy: groupByMock,
    })
  );
  return { from: fromMock };
}

function createMockDb() {
  const returningMock = vi.fn().mockResolvedValue([{ id: 'new-id' }]);
  const insertValuesMock = vi.fn().mockReturnValue({ returning: returningMock });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  const selectMock = vi.fn().mockImplementation(() => createSelectChain([]));

  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

  const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });

  return {
    insert: insertMock,
    select: selectMock,
    update: updateMock,
    delete: deleteMock,
    _chains: {
      insert: { values: insertValuesMock, returning: returningMock },
      update: { set: updateSetMock, where: updateWhereMock },
      delete: { where: deleteWhereMock },
    },
  };
}

function setupSelectSequence(db: ReturnType<typeof createMockDb>, sequence: unknown[]) {
  let callIdx = 0;
  db.select.mockImplementation(() => {
    const data = sequence[callIdx] ?? [];
    callIdx++;
    return createSelectChain(data);
  });
}

function createMockCtx(overrides: Record<string, unknown> = {}) {
  return {
    session: { user: { id: 'user-1', email: 'test@test.com', role: 'admin' } },
    db: createMockDb(),
    headers: new Headers(),
    activeOrganizationId: 'org-1',
    ...overrides,
  };
}

const AFFILIATE_UUID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';

const MOCK_AFFILIATE = {
  id: AFFILIATE_UUID,
  userId: 'user-1',
  code: 'abc12345',
  commissionPercent: 20,
  status: 'active',
  totalReferrals: 5,
  totalEarningsCents: 15000,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('affiliatesRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // getMyAffiliate
  // =========================================================================
  describe('getMyAffiliate', () => {
    it('returns null when not registered', async () => {
      const ctx = createMockCtx();

      const caller = affiliatesRouter.createCaller(ctx as never);
      const result = await caller.getMyAffiliate();

      expect(result).toBeNull();
    });

    it('returns affiliate data when registered', async () => {
      const ctx = createMockCtx();
      setupSelectSequence(ctx.db, [[MOCK_AFFILIATE]]);

      const caller = affiliatesRouter.createCaller(ctx as never);
      const result = await caller.getMyAffiliate();

      expect(result).toEqual(MOCK_AFFILIATE);
      expect(result!.code).toBe('abc12345');
      expect(result!.commissionPercent).toBe(20);
    });
  });

  // =========================================================================
  // register
  // =========================================================================
  describe('register', () => {
    it('creates new affiliate with code', async () => {
      const ctx = createMockCtx();
      // First select: no existing affiliate
      setupSelectSequence(ctx.db, [[]]);
      ctx.db.insert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const caller = affiliatesRouter.createCaller(ctx as never);
      const result = await caller.register();

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('code');
      expect(typeof result.code).toBe('string');
      expect(result.code.length).toBe(8);
      expect(ctx.db.insert).toHaveBeenCalled();

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'affiliate.register',
          entityType: 'affiliate',
          metadata: expect.objectContaining({ code: expect.any(String) }),
        })
      );
    });

    it('throws CONFLICT when already registered', async () => {
      const ctx = createMockCtx();
      setupSelectSequence(ctx.db, [[{ id: AFFILIATE_UUID }]]);

      const caller = affiliatesRouter.createCaller(ctx as never);

      await expect(caller.register()).rejects.toThrow('Already registered as affiliate');
    });
  });

  // =========================================================================
  // getStats
  // =========================================================================
  describe('getStats', () => {
    it('returns null when not an affiliate', async () => {
      const ctx = createMockCtx();

      const caller = affiliatesRouter.createCaller(ctx as never);
      const result = await caller.getStats();

      expect(result).toBeNull();
    });

    it('returns affiliate stats with referrals and events', async () => {
      const ctx = createMockCtx();
      const referrals = [
        { id: 'ref-1', status: 'converted', createdAt: new Date(), convertedAt: new Date() },
      ];
      const events = [
        { id: 'evt-1', affiliateId: AFFILIATE_UUID, type: 'commission', amountCents: 500, createdAt: new Date() },
      ];

      // Call sequence: affiliate, referrals, events
      setupSelectSequence(ctx.db, [[MOCK_AFFILIATE], referrals, events]);

      const caller = affiliatesRouter.createCaller(ctx as never);
      const result = await caller.getStats();

      expect(result).not.toBeNull();
      expect(result!.affiliate).toEqual(MOCK_AFFILIATE);
      expect(result!.referrals).toEqual(referrals);
      expect(result!.recentEvents).toEqual(events);
    });
  });

  // =========================================================================
  // adminList
  // =========================================================================
  describe('adminList', () => {
    it('returns paginated affiliates', async () => {
      const ctx = createMockCtx();
      const affiliates = [
        { id: 'aff-1', userId: 'u1', code: 'abc', commissionPercent: 20, status: 'active', totalReferrals: 3, totalEarningsCents: 1000, createdAt: new Date() },
      ];

      // Promise.all: items + count
      setupSelectSequence(ctx.db, [affiliates, [{ count: 1 }]]);

      const caller = affiliatesRouter.createCaller(ctx as never);
      const result = await caller.adminList({ page: 1, pageSize: 20 });

      expect(result).toEqual({
        results: affiliates,
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    });

    it('filters by status', async () => {
      const ctx = createMockCtx();
      setupSelectSequence(ctx.db, [[], [{ count: 0 }]]);

      const caller = affiliatesRouter.createCaller(ctx as never);
      const result = await caller.adminList({ status: 'suspended', page: 1, pageSize: 20 });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // =========================================================================
  // adminGet
  // =========================================================================
  describe('adminGet', () => {
    it('returns affiliate with user info, referrals, and events', async () => {
      const ctx = createMockCtx();
      const userInfo = { id: 'user-1', name: 'Test User', email: 'test@test.com' };
      const referrals = [{ id: 'ref-1', status: 'converted', createdAt: new Date() }];
      const events = [{ id: 'evt-1', type: 'signup', createdAt: new Date() }];

      // Call sequence: affiliate, user, referrals, events
      setupSelectSequence(ctx.db, [[MOCK_AFFILIATE], [userInfo], referrals, events]);

      const caller = affiliatesRouter.createCaller(ctx as never);
      const result = await caller.adminGet({ id: AFFILIATE_UUID });

      expect(result.id).toBe(AFFILIATE_UUID);
      expect(result.user).toEqual(userInfo);
      expect(result.referrals).toEqual(referrals);
      expect(result.events).toEqual(events);
    });

    it('throws NOT_FOUND when affiliate does not exist', async () => {
      const ctx = createMockCtx();

      const caller = affiliatesRouter.createCaller(ctx as never);

      await expect(
        caller.adminGet({ id: AFFILIATE_UUID })
      ).rejects.toThrow('Affiliate not found');
    });
  });

  // =========================================================================
  // updateStatus
  // =========================================================================
  describe('updateStatus', () => {
    it('changes status and logs audit', async () => {
      const ctx = createMockCtx();
      const caller = affiliatesRouter.createCaller(ctx as never);
      const result = await caller.updateStatus({
        id: AFFILIATE_UUID,
        status: 'suspended',
      });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'suspended' })
      );

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'affiliate.updateStatus',
          entityType: 'affiliate',
          entityId: AFFILIATE_UUID,
          metadata: { status: 'suspended' },
        })
      );
    });
  });

  // =========================================================================
  // updateCommission
  // =========================================================================
  describe('updateCommission', () => {
    it('updates commission percentage', async () => {
      const ctx = createMockCtx();
      const caller = affiliatesRouter.createCaller(ctx as never);
      const result = await caller.updateCommission({
        id: AFFILIATE_UUID,
        commissionPercent: 30,
      });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({ commissionPercent: 30 })
      );

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'affiliate.updateCommission',
          entityType: 'affiliate',
          entityId: AFFILIATE_UUID,
          metadata: { commissionPercent: 30 },
        })
      );
    });

    it('rejects commission outside 0-100 range', async () => {
      const ctx = createMockCtx();
      const caller = affiliatesRouter.createCaller(ctx as never);

      await expect(
        caller.updateCommission({ id: AFFILIATE_UUID, commissionPercent: 150 })
      ).rejects.toThrow();

      await expect(
        caller.updateCommission({ id: AFFILIATE_UUID, commissionPercent: -5 })
      ).rejects.toThrow();
    });
  });
});
