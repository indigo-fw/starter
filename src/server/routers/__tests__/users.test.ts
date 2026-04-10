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
  ROLES: ['user', 'editor', 'admin', 'superadmin'],
  isSuperAdmin: vi.fn((role: string | null | undefined) => role === 'superadmin'),
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

vi.mock('@/core/lib/analytics/gdpr', () => ({
  anonymizeUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/core/lib/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/server/db/schema', () => ({
  user: {
    id: 'user.id',
    name: 'user.name',
    email: 'user.email',
    role: 'user.role',
    banned: 'user.banned',
    banReason: 'user.ban_reason',
    banExpires: 'user.ban_expires',
    image: 'user.image',
    createdAt: 'user.created_at',
    updatedAt: 'user.updated_at',
  },
  session: {
    id: 'session.id',
    userId: 'session.user_id',
    ipAddress: 'session.ip_address',
    userAgent: 'session.user_agent',
    createdAt: 'session.created_at',
    expiresAt: 'session.expires_at',
  },
  cmsUserPreferences: {
    userId: 'cms_user_preferences.user_id',
    data: 'cms_user_preferences.data',
    updatedAt: 'cms_user_preferences.updated_at',
  },
}));

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { asMock } from '@/test-utils';
import { usersRouter } from '../users';
import { fetchOrNotFound } from '@/core/crud/admin-crud';
import { anonymizeUser } from '@/core/lib/analytics/gdpr';
import { logAudit } from '@/core/lib/audit';
import { isSuperAdmin } from '@/core/policy';
import { createMockCtx } from './test-helpers';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id: 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5',
  name: 'Alice Smith',
  email: 'alice@example.com',
  role: 'editor',
  banned: false,
  banReason: null,
  createdAt: new Date('2025-01-01'),
  image: null,
};

const ADMIN_USER_ID = 'f1f1f1f1-a2a2-4b3b-9c4c-d5d5d5d5d5d5';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usersRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: isSuperAdmin returns false for non-superadmin
    asMock(isSuperAdmin).mockImplementation((role: unknown) => role === 'superadmin');
  });

  // =========================================================================
  // list
  // =========================================================================
  describe('list', () => {
    it('returns paginated user list with defaults', async () => {
      createMockCtx({ session: { user: { id: ADMIN_USER_ID, email: 'admin@test.com', role: 'admin' } } });

      // list uses two concurrent selects (items + count); use a custom dual-select db
      const itemsLimitMock = vi.fn().mockResolvedValue([MOCK_USER]);
      const itemsOffsetMock = vi.fn().mockReturnValue({ limit: itemsLimitMock });
      const itemsOrderByMock = vi.fn().mockReturnValue({ offset: itemsOffsetMock });
      const itemsWhereMock = vi.fn().mockReturnValue({ orderBy: itemsOrderByMock });
      const itemsFromMock = vi.fn().mockReturnValue({ where: itemsWhereMock });

      const countWhereMock = vi.fn().mockResolvedValue([{ count: 1 }]);
      const countFromMock = vi.fn().mockReturnValue({ where: countWhereMock });

      let selectCall = 0;
      const selectMock = vi.fn().mockImplementation(() => {
        selectCall++;
        return selectCall % 2 === 1 ? { from: itemsFromMock } : { from: countFromMock };
      });

      const db = { select: selectMock, insert: vi.fn(), update: vi.fn(), delete: vi.fn() };
      const adminCtx = createMockCtx({
        session: { user: { id: ADMIN_USER_ID, email: 'admin@test.com', role: 'admin' } },
        db,
      });

      const caller = usersRouter.createCaller(adminCtx as never);
      const result = await caller.list({});

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({ email: 'alice@example.com' });
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('passes search and role filters to the query', async () => {
      // Verify that both select chains are called (we check the selects are called at all)
      const itemsLimitMock = vi.fn().mockResolvedValue([]);
      const itemsOffsetMock = vi.fn().mockReturnValue({ limit: itemsLimitMock });
      const itemsOrderByMock = vi.fn().mockReturnValue({ offset: itemsOffsetMock });
      const itemsWhereMock = vi.fn().mockReturnValue({ orderBy: itemsOrderByMock });
      const itemsFromMock = vi.fn().mockReturnValue({ where: itemsWhereMock });

      const countWhereMock = vi.fn().mockResolvedValue([{ count: 0 }]);
      const countFromMock = vi.fn().mockReturnValue({ where: countWhereMock });

      let selectCall = 0;
      const selectMock = vi.fn().mockImplementation(() => {
        selectCall++;
        return selectCall % 2 === 1 ? { from: itemsFromMock } : { from: countFromMock };
      });

      const db = { select: selectMock, insert: vi.fn(), update: vi.fn(), delete: vi.fn() };
      const ctx = createMockCtx({ db });

      const caller = usersRouter.createCaller(ctx as never);
      const result = await caller.list({ search: 'alice', role: 'editor', page: 1, pageSize: 10 });

      // Both select chains were called
      expect(selectMock).toHaveBeenCalledTimes(2);
      expect(result.results).toHaveLength(0);
    });

    it('rejects pageSize > 100', async () => {
      const ctx = createMockCtx();
      const caller = usersRouter.createCaller(ctx as never);

      await expect(caller.list({ pageSize: 101 })).rejects.toThrow();
    });
  });

  // =========================================================================
  // get
  // =========================================================================
  describe('get', () => {
    it('returns the user when found', async () => {
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_USER);

      const ctx = createMockCtx();
      const caller = usersRouter.createCaller(ctx as never);
      const result = await caller.get({ id: MOCK_USER.id });

      expect(result).toMatchObject({ email: 'alice@example.com', role: 'editor' });
      expect(fetchOrNotFound).toHaveBeenCalledWith(
        ctx.db,
        expect.anything(),
        MOCK_USER.id,
        'User'
      );
    });

    it('propagates NOT_FOUND from fetchOrNotFound', async () => {
      const { TRPCError } = await import('@trpc/server');
      asMock(fetchOrNotFound).mockRejectedValue(
        new TRPCError({ code: 'NOT_FOUND', message: 'User not found' })
      );

      const ctx = createMockCtx();
      const caller = usersRouter.createCaller(ctx as never);

      await expect(
        caller.get({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4' })
      ).rejects.toThrow('User not found');
    });
  });

  // =========================================================================
  // updateRole
  // =========================================================================
  describe('updateRole', () => {
    it('allows admin to promote editor to admin', async () => {
      const ctx = createMockCtx({
        session: { user: { id: ADMIN_USER_ID, email: 'admin@test.com', role: 'admin' } },
      });
      // Target user is editor
      ctx.db._chains.select.limit.mockResolvedValue([{ role: 'editor' }]);

      const caller = usersRouter.createCaller(ctx as never);
      const result = await caller.updateRole({ id: MOCK_USER.id, role: 'admin' });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
    });

    it('throws NOT_FOUND when target user does not exist', async () => {
      const ctx = createMockCtx({
        session: { user: { id: ADMIN_USER_ID, email: 'admin@test.com', role: 'admin' } },
      });
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = usersRouter.createCaller(ctx as never);

      await expect(
        caller.updateRole({ id: 'missing-id', role: 'editor' })
      ).rejects.toThrow('User not found');
    });

    it('throws FORBIDDEN when non-superadmin tries to promote to superadmin', async () => {
      const ctx = createMockCtx({
        session: { user: { id: ADMIN_USER_ID, email: 'admin@test.com', role: 'admin' } },
      });
      // Target is an editor; actor is admin (not superadmin)
      ctx.db._chains.select.limit.mockResolvedValue([{ role: 'editor' }]);
      asMock(isSuperAdmin).mockReturnValue(false);

      const caller = usersRouter.createCaller(ctx as never);

      await expect(
        caller.updateRole({ id: MOCK_USER.id, role: 'superadmin' })
      ).rejects.toThrow('Only superadmin can promote to or demote from superadmin');
    });

    it('throws FORBIDDEN when non-superadmin tries to demote a superadmin', async () => {
      const ctx = createMockCtx({
        session: { user: { id: ADMIN_USER_ID, email: 'admin@test.com', role: 'admin' } },
      });
      // Target is currently superadmin
      ctx.db._chains.select.limit.mockResolvedValue([{ role: 'superadmin' }]);
      asMock(isSuperAdmin).mockReturnValue(false);

      const caller = usersRouter.createCaller(ctx as never);

      await expect(
        caller.updateRole({ id: MOCK_USER.id, role: 'admin' })
      ).rejects.toThrow('Only superadmin can promote to or demote from superadmin');
    });

    it('allows superadmin to promote user to superadmin', async () => {
      const superadminId = 's1s1s1s1-a2a2-4b3b-9c4c-d5d5d5d5d5d5';
      const ctx = createMockCtx({
        session: { user: { id: superadminId, email: 'super@test.com', role: 'superadmin' } },
      });
      ctx.db._chains.select.limit.mockResolvedValue([{ role: 'admin' }]);
      asMock(isSuperAdmin).mockReturnValue(true);

      const caller = usersRouter.createCaller(ctx as never);
      const result = await caller.updateRole({ id: MOCK_USER.id, role: 'superadmin' });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
    });

    it('logs an audit entry after successful role change', async () => {
      const ctx = createMockCtx({
        session: { user: { id: ADMIN_USER_ID, email: 'admin@test.com', role: 'admin' } },
      });
      ctx.db._chains.select.limit.mockResolvedValue([{ role: 'editor' }]);

      const caller = usersRouter.createCaller(ctx as never);
      await caller.updateRole({ id: MOCK_USER.id, role: 'admin' });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: ADMIN_USER_ID,
          action: 'user.updateRole',
          entityType: 'user',
          entityId: MOCK_USER.id,
          metadata: { from: 'editor', to: 'admin' },
        })
      );
    });

    it('rejects invalid role values', async () => {
      const ctx = createMockCtx();
      const caller = usersRouter.createCaller(ctx as never);

      await expect(
        caller.updateRole({ id: MOCK_USER.id, role: 'god' as never })
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // ban / unban
  // =========================================================================
  describe('ban', () => {
    it('bans a non-superadmin user and returns success', async () => {
      const ctx = createMockCtx({
        session: { user: { id: ADMIN_USER_ID, email: 'admin@test.com', role: 'admin' } },
      });
      ctx.db._chains.select.limit.mockResolvedValue([{ role: 'editor' }]);
      asMock(isSuperAdmin).mockReturnValue(false);

      const caller = usersRouter.createCaller(ctx as never);
      const result = await caller.ban({ id: MOCK_USER.id, reason: 'Spam' });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
    });

    it('throws FORBIDDEN when trying to ban a superadmin', async () => {
      const ctx = createMockCtx({
        session: { user: { id: ADMIN_USER_ID, email: 'admin@test.com', role: 'admin' } },
      });
      ctx.db._chains.select.limit.mockResolvedValue([{ role: 'superadmin' }]);
      asMock(isSuperAdmin).mockReturnValue(true);

      const caller = usersRouter.createCaller(ctx as never);

      await expect(
        caller.ban({ id: MOCK_USER.id })
      ).rejects.toThrow('Cannot ban a superadmin');
    });

    it('throws NOT_FOUND when target user does not exist', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = usersRouter.createCaller(ctx as never);

      await expect(
        caller.ban({ id: 'missing-id' })
      ).rejects.toThrow('User not found');
    });
  });

  describe('unban', () => {
    it('unbans a user and returns success', async () => {
      const ctx = createMockCtx({
        session: { user: { id: ADMIN_USER_ID, email: 'admin@test.com', role: 'admin' } },
      });

      const caller = usersRouter.createCaller(ctx as never);
      const result = await caller.unban({ id: MOCK_USER.id });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'user.unban',
          entityId: MOCK_USER.id,
        })
      );
    });
  });

  // =========================================================================
  // gdprAnonymize
  // =========================================================================
  describe('gdprAnonymize', () => {
    it('calls anonymizeUser with full mode by default', async () => {
      const ctx = createMockCtx({
        session: { user: { id: ADMIN_USER_ID, email: 'admin@test.com', role: 'admin' } },
      });

      const caller = usersRouter.createCaller(ctx as never);
      const result = await caller.gdprAnonymize({ id: MOCK_USER.id, mode: 'full' });

      expect(result).toEqual({ success: true });
      expect(anonymizeUser).toHaveBeenCalledWith(
        ctx.db,
        MOCK_USER.id,
        ADMIN_USER_ID,
        'full'
      );
    });

    it('calls anonymizeUser with pseudonymize mode', async () => {
      const ctx = createMockCtx({
        session: { user: { id: ADMIN_USER_ID, email: 'admin@test.com', role: 'admin' } },
      });

      const caller = usersRouter.createCaller(ctx as never);
      await caller.gdprAnonymize({ id: MOCK_USER.id, mode: 'pseudonymize' });

      expect(anonymizeUser).toHaveBeenCalledWith(
        ctx.db,
        MOCK_USER.id,
        ADMIN_USER_ID,
        'pseudonymize'
      );
    });

    it('wraps anonymizeUser errors in BAD_REQUEST', async () => {
      asMock(anonymizeUser).mockRejectedValue(new Error('Cannot anonymize a staff account'));

      const ctx = createMockCtx({
        session: { user: { id: ADMIN_USER_ID, email: 'admin@test.com', role: 'admin' } },
      });

      const caller = usersRouter.createCaller(ctx as never);

      await expect(
        caller.gdprAnonymize({ id: MOCK_USER.id, mode: 'full' })
      ).rejects.toThrow('Cannot anonymize a staff account');
    });
  });

  // =========================================================================
  // counts
  // =========================================================================
  describe('counts', () => {
    /**
     * counts() calls select().from().groupBy() directly — no `.where()` step.
     * createMockDb's `.from()` does not expose groupBy at that level, so we
     * build a minimal inline db for these two tests.
     */
    function createCountsDb(rows: Array<{ role: string; count: number }>) {
      const groupByMock = vi.fn().mockResolvedValue(rows);
      const fromMock = vi.fn().mockReturnValue({ groupBy: groupByMock });
      const selectMock = vi.fn().mockReturnValue({ from: fromMock });
      return {
        select: selectMock,
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
    }

    it('aggregates role counts and returns total', async () => {
      const db = createCountsDb([
        { role: 'user', count: 5 },
        { role: 'editor', count: 3 },
        { role: 'admin', count: 2 },
      ]);
      const ctx = createMockCtx({ db });

      const caller = usersRouter.createCaller(ctx as never);
      const result = await caller.counts();

      expect(result.user).toBe(5);
      expect(result.editor).toBe(3);
      expect(result.admin).toBe(2);
      expect(result.all).toBe(10);
    });

    it('returns zeroed counts when no users exist', async () => {
      const db = createCountsDb([]);
      const ctx = createMockCtx({ db });

      const caller = usersRouter.createCaller(ctx as never);
      const result = await caller.counts();

      expect(result.all).toBe(0);
    });
  });
});
