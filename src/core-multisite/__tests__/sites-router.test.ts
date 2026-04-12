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
  isSuperAdmin: vi.fn((role: string | null | undefined) => role === 'superadmin'),
}));

vi.mock('@/core/lib/infra/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/core/lib/webhooks/webhooks', () => ({
  dispatchWebhook: vi.fn(),
}));

vi.mock('@/core/lib/content/slug', () => ({
  slugify: vi.fn((s: string) => s.toLowerCase().replace(/\s+/g, '-')),
}));

vi.mock('@/core-multisite/lib/schema-manager', () => ({
  schemaNameFromSlug: vi.fn((slug: string) => `site_${slug.replace(/-/g, '_')}`),
  createSiteSchema: vi.fn().mockResolvedValue(undefined),
  dropSiteSchema: vi.fn().mockResolvedValue(undefined),
}));

// Mock postgres + drizzle for clone's dedicated connection
const { mockCloneExecute, mockCloneEnd } = vi.hoisted(() => ({
  mockCloneExecute: vi.fn().mockResolvedValue([]),
  mockCloneEnd: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('postgres', () => ({
  default: vi.fn().mockReturnValue({ end: mockCloneEnd }),
}));
vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn().mockReturnValue({ execute: mockCloneExecute }),
}));

vi.mock('@/core-multisite/lib/site-resolver', () => ({
  invalidateSiteCache: vi.fn(),
  clearSiteCache: vi.fn(),
}));

vi.mock('@/core-multisite/lib/site-config', () => ({
  invalidateSiteConfig: vi.fn(),
}));

import { asMock as _asMock } from '@/core/test-utils';
import { logAudit } from '@/core/lib/infra/audit';
import { dispatchWebhook } from '@/core/lib/webhooks/webhooks';
import { invalidateSiteCache, clearSiteCache } from '@/core-multisite/lib/site-resolver';
import { invalidateSiteConfig } from '@/core-multisite/lib/site-config';
import { sitesRouter } from '../routers/sites';
import { SiteStatus } from '../schema/sites';

// ---------------------------------------------------------------------------
// Mock DB builder — supports multiple sequential queries
// ---------------------------------------------------------------------------

function createChainableMock(resolvedValue: unknown = [], interceptors?: Record<string, (args: unknown[]) => void>) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  // Every method returns the proxy. The proxy is also thenable — awaiting it
  // at any point in the chain resolves to resolvedValue. This handles queries
  // that don't end with .limit() or .returning() (e.g. count queries, deletes).
  const proxy: Record<string, unknown> = new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      // Make the proxy thenable so `await db.select()...where()` works
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(resolvedValue);
      }
      if (!chain[prop]) {
        chain[prop] = vi.fn().mockImplementation((...args: unknown[]) => {
          interceptors?.[prop]?.(args);
          return proxy;
        });
      }
      // Terminal methods also resolve the value directly
      if (prop === 'limit' || prop === 'returning') {
        chain[prop].mockResolvedValue(resolvedValue);
        return chain[prop];
      }
      return chain[prop];
    },
  });

  return { proxy, chain };
}

interface MockDbOpts {
  selectResults?: unknown[][];
  insertResults?: unknown[][];
  updateResults?: unknown[][];
  deleteResults?: unknown[][];
  executeResults?: unknown[];
}

interface MockDb {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  /** Captured .set() arguments from update chains, in call order */
  _setCalls: unknown[];
  /** Captured .values() arguments from insert chains, in call order */
  _valuesCalls: unknown[];
}

function createMultisiteDb(opts: MockDbOpts = {}): MockDb {
  let selectCallIdx = 0;
  let insertCallIdx = 0;
  let updateCallIdx = 0;
  let deleteCallIdx = 0;
  let executeCallIdx = 0;

  const selectResults = opts.selectResults ?? [[]];
  const insertResults = opts.insertResults ?? [[]];
  const updateResults = opts.updateResults ?? [[]];
  const deleteResults = opts.deleteResults ?? [[]];
  const executeResults = opts.executeResults ?? [];

  const _setCalls: unknown[] = [];
  const _valuesCalls: unknown[] = [];

  // For each call to select/insert/update/delete, return a fresh chainable mock
  // with the next result in the array
  const selectMock = vi.fn().mockImplementation(() => {
    const result = selectResults[selectCallIdx] ?? [];
    selectCallIdx++;
    return createChainableMock(result).proxy;
  });

  const insertMock = vi.fn().mockImplementation(() => {
    const result = insertResults[insertCallIdx] ?? [];
    insertCallIdx++;
    return createChainableMock(result, {
      values: (args) => _valuesCalls.push(args[0]),
    }).proxy;
  });

  const updateMock = vi.fn().mockImplementation(() => {
    const result = updateResults[updateCallIdx] ?? [];
    updateCallIdx++;
    return createChainableMock(result, {
      set: (args) => _setCalls.push(args[0]),
    }).proxy;
  });

  const deleteMock = vi.fn().mockImplementation(() => {
    const result = deleteResults[deleteCallIdx] ?? [];
    deleteCallIdx++;
    return createChainableMock(result).proxy;
  });

  const executeMock = vi.fn().mockImplementation(() => {
    const result = executeResults[executeCallIdx] ?? [];
    executeCallIdx++;
    return Promise.resolve(result);
  });

  return {
    select: selectMock,
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
    execute: executeMock,
    _setCalls,
    _valuesCalls,
  };
}

function createCtx(opts: MockDbOpts & { role?: string; userId?: string } = {}) {
  const { role = 'superadmin', userId = 'user-1', ...dbOpts } = opts;
  return {
    session: { user: { id: userId, email: 'test@test.com', role } },
    db: createMultisiteDb(dbOpts),
    headers: new Headers(),
    activeOrganizationId: null,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SITE_ACTIVE = {
  id: 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5',
  name: 'Test Site',
  slug: 'test-site',
  schemaName: 'site_test_site',
  defaultLocale: 'en',
  locales: ['en'],
  settings: {},
  status: SiteStatus.ACTIVE,
  isNetworkAdmin: false,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

const SITE_SUSPENDED = { ...SITE_ACTIVE, id: 'b2b2b2b2-c3c3-4d4d-8e5e-f6f6f6f6f6f6', status: SiteStatus.SUSPENDED };
const SITE_DELETED = { ...SITE_ACTIVE, id: 'c3c3c3c3-d4d4-4e5e-8f6f-a7a7a7a7a7a7', status: SiteStatus.DELETED, deletedAt: new Date() };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sitesRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCloneExecute.mockReset().mockResolvedValue([]);
    mockCloneEnd.mockReset().mockResolvedValue(undefined);
  });

  // ── suspend ─────────────────────────────────────────────────────────────

  describe('suspend', () => {
    it('suspends an active site', async () => {
      const ctx = createCtx({
        updateResults: [[{ ...SITE_ACTIVE, status: SiteStatus.SUSPENDED }]],
      });
      const caller = sitesRouter.createCaller(ctx as never);

      const result = await caller.suspend({ id: SITE_ACTIVE.id });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
      // Verify .set() was called with SUSPENDED status
      expect(ctx.db._setCalls[0]).toEqual(
        expect.objectContaining({ status: SiteStatus.SUSPENDED })
      );
      expect(clearSiteCache).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'site.suspended' })
      );
      expect(dispatchWebhook).toHaveBeenCalledWith(
        ctx.db, 'site.suspended', expect.objectContaining({ siteId: SITE_ACTIVE.id })
      );
    });

    it('throws NOT_FOUND for non-active site', async () => {
      const ctx = createCtx({ updateResults: [[]] });
      const caller = sitesRouter.createCaller(ctx as never);

      await expect(caller.suspend({ id: '00000000-0000-4000-8000-000000000000' }))
        .rejects.toThrow('Active site not found');
    });
  });

  // ── unsuspend ───────────────────────────────────────────────────────────

  describe('unsuspend', () => {
    it('unsuspends a suspended site', async () => {
      const ctx = createCtx({
        updateResults: [[{ ...SITE_SUSPENDED, status: SiteStatus.ACTIVE }]],
      });
      const caller = sitesRouter.createCaller(ctx as never);

      const result = await caller.unsuspend({ id: SITE_SUSPENDED.id });

      expect(result).toEqual({ success: true });
      // Verify .set() transitions to ACTIVE
      expect(ctx.db._setCalls[0]).toEqual(
        expect.objectContaining({ status: SiteStatus.ACTIVE })
      );
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'site.unsuspended' })
      );
      expect(dispatchWebhook).toHaveBeenCalledWith(
        ctx.db, 'site.unsuspended', expect.any(Object)
      );
    });

    it('throws NOT_FOUND for non-suspended site', async () => {
      const ctx = createCtx({ updateResults: [[]] });
      const caller = sitesRouter.createCaller(ctx as never);

      await expect(caller.unsuspend({ id: '00000000-0000-4000-8000-000000000000' }))
        .rejects.toThrow('Suspended site not found');
    });
  });

  // ── restore ─────────────────────────────────────────────────────────────

  describe('restore', () => {
    it('restores a soft-deleted site', async () => {
      const ctx = createCtx({
        updateResults: [[{ ...SITE_DELETED, status: SiteStatus.ACTIVE, deletedAt: null }]],
      });
      const caller = sitesRouter.createCaller(ctx as never);

      const result = await caller.restore({ id: SITE_DELETED.id });

      expect(result).toEqual({ success: true });
      // Verify .set() transitions to ACTIVE and clears deletedAt
      expect(ctx.db._setCalls[0]).toEqual(
        expect.objectContaining({ status: SiteStatus.ACTIVE, deletedAt: null })
      );
      expect(invalidateSiteCache).toHaveBeenCalledWith(undefined, SITE_DELETED.slug);
      expect(clearSiteCache).toHaveBeenCalled();
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'site.restored' })
      );
      expect(dispatchWebhook).toHaveBeenCalledWith(
        ctx.db, 'site.restored', expect.any(Object)
      );
    });

    it('throws NOT_FOUND for non-deleted site', async () => {
      const ctx = createCtx({ updateResults: [[]] });
      const caller = sitesRouter.createCaller(ctx as never);

      await expect(caller.restore({ id: '00000000-0000-4000-8000-000000000000' }))
        .rejects.toThrow('Deleted site not found');
    });
  });

  // ── hardDelete ────────────────────────────────────────────────────────────

  describe('hardDelete', () => {
    it('hard-deletes a soft-deleted site with full cleanup', async () => {
      const ctx = createCtx({
        selectResults: [[SITE_DELETED]],  // site lookup
      });
      const caller = sitesRouter.createCaller(ctx as never);

      const result = await caller.hardDelete({ id: SITE_DELETED.id });

      expect(result).toEqual({ success: true });
      // Verify cache invalidation
      expect(invalidateSiteCache).toHaveBeenCalledWith(undefined, SITE_DELETED.slug);
      expect(clearSiteCache).toHaveBeenCalled();
      // Verify audit + webhook
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'site.hard_deleted' })
      );
      expect(dispatchWebhook).toHaveBeenCalledWith(
        ctx.db, 'site.hard_deleted', expect.objectContaining({ siteId: SITE_DELETED.id })
      );
      // Verify deletions happened (3 delete calls: domains, members, sites)
      expect(ctx.db.delete).toHaveBeenCalledTimes(3);
    });

    it('requires prior soft-delete', async () => {
      const ctx = createCtx({ selectResults: [[]] });
      const caller = sitesRouter.createCaller(ctx as never);

      await expect(caller.hardDelete({ id: '00000000-0000-4000-8000-000000000000' }))
        .rejects.toThrow('Site not found or not soft-deleted yet');
    });
  });

  // ── softDelete ──────────────────────────────────────────────────────────

  describe('softDelete', () => {
    it('soft-deletes a site and dispatches webhook', async () => {
      const ctx = createCtx({
        updateResults: [[SITE_DELETED]],
      });
      const caller = sitesRouter.createCaller(ctx as never);

      const result = await caller.softDelete({ id: SITE_ACTIVE.id });

      expect(result).toEqual({ success: true });
      // Verify .set() transitions to DELETED with deletedAt timestamp
      expect(ctx.db._setCalls[0]).toEqual(
        expect.objectContaining({ status: SiteStatus.DELETED })
      );
      expect(ctx.db._setCalls[0]).toHaveProperty('deletedAt');
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'site.deleted' })
      );
      expect(dispatchWebhook).toHaveBeenCalledWith(
        ctx.db, 'site.deleted', expect.any(Object)
      );
    });
  });

  // ── update ──────────────────────────────────────────────────────────────

  describe('update', () => {
    it('invalidates caches and dispatches webhook', async () => {
      const ctx = createCtx({
        updateResults: [[SITE_ACTIVE]],
      });
      const caller = sitesRouter.createCaller(ctx as never);

      const result = await caller.update({ id: SITE_ACTIVE.id, name: 'New Name' });

      expect(result).toEqual(SITE_ACTIVE);
      expect(invalidateSiteCache).toHaveBeenCalledWith(undefined, SITE_ACTIVE.slug);
      expect(invalidateSiteConfig).toHaveBeenCalledWith(SITE_ACTIVE.id);
      expect(dispatchWebhook).toHaveBeenCalledWith(
        ctx.db, 'site.updated', expect.objectContaining({ siteId: SITE_ACTIVE.id })
      );
    });

    it('rejects invalid locale', async () => {
      const ctx = createCtx();
      const caller = sitesRouter.createCaller(ctx as never);

      await expect(caller.update({ id: SITE_ACTIVE.id, defaultLocale: 'zz' }))
        .rejects.toThrow();
    });
  });

  // ── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('rejects invalid locale in locales array', async () => {
      const ctx = createCtx();
      const caller = sitesRouter.createCaller(ctx as never);

      await expect(
        caller.create({ name: 'Test', locales: ['en', 'zz'] })
      ).rejects.toThrow();
    });

    it('creates site with valid locales', async () => {
      const ctx = createCtx({
        insertResults: [
          [SITE_ACTIVE],  // site insert
          [{}],           // member insert
        ],
      });
      const caller = sitesRouter.createCaller(ctx as never);

      const result = await caller.create({ name: 'Test Site', locales: ['en', 'de'] });

      expect(result).toEqual(SITE_ACTIVE);
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'site.created' })
      );
      expect(dispatchWebhook).toHaveBeenCalledWith(
        ctx.db, 'site.created', expect.objectContaining({ name: SITE_ACTIVE.name })
      );
    });
  });

  // ── stats ───────────────────────────────────────────────────────────────

  describe('stats', () => {
    it('returns aggregate counts from single query', async () => {
      const statsRow = {
        activeSites: 5,
        suspendedSites: 2,
        totalDomains: 10,
        verifiedDomains: 8,
        totalMembers: 15,
      };
      const ctx = createCtx({
        executeResults: [[statsRow]],
      });
      const caller = sitesRouter.createCaller(ctx as never);

      const result = await caller.stats();

      expect(result).toEqual(statsRow);
      expect(ctx.db.execute).toHaveBeenCalledTimes(1);
    });
  });

  // ── addDomain ───────────────────────────────────────────────────────────

  describe('addDomain', () => {
    it('enforces max domains per site', async () => {
      const ctx = createCtx({
        selectResults: [
          [{ value: 20 }],  // domain count = MAX
        ],
      });
      const caller = sitesRouter.createCaller(ctx as never);

      await expect(
        caller.addDomain({ siteId: SITE_ACTIVE.id, domain: 'new.example.com' })
      ).rejects.toThrow('Maximum 20 domains per site');
    });

    it('rejects duplicate domain', async () => {
      const ctx = createCtx({
        selectResults: [
          [{ value: 1 }],             // domain count OK
          [{ id: 'e2e2e2e2-f3f3-4a4a-8b5b-c6c6c6c6c6c6' }],    // domain already exists
        ],
      });
      const caller = sitesRouter.createCaller(ctx as never);

      await expect(
        caller.addDomain({ siteId: SITE_ACTIVE.id, domain: 'taken.com' })
      ).rejects.toThrow('already registered');
    });

    it('adds domain and returns verification instruction', async () => {
      const newDomain = {
        id: 'd1d1d1d1-e2e2-4f3f-8a4a-b5b5b5b5b5b5',
        siteId: SITE_ACTIVE.id,
        domain: 'new.example.com',
        isPrimary: false,
        verified: false,
        verificationToken: 'abc123',
      };
      const ctx = createCtx({
        selectResults: [
          [{ value: 1 }],  // domain count OK
          [],               // no existing domain
        ],
        insertResults: [[newDomain]],
      });
      const caller = sitesRouter.createCaller(ctx as never);

      const result = await caller.addDomain({ siteId: SITE_ACTIVE.id, domain: 'new.example.com' });

      expect(result.verificationInstruction).toContain('indigo-verify=');
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'domain.added' })
      );
    });
  });

  // ── removeDomain ────────────────────────────────────────────────────────

  describe('removeDomain', () => {
    it('removes domain and invalidates cache', async () => {
      const ctx = createCtx({
        selectResults: [[{ id: 'd1d1d1d1-e2e2-4f3f-8a4a-b5b5b5b5b5b5', domain: 'old.com', siteId: SITE_ACTIVE.id }]],
      });
      const caller = sitesRouter.createCaller(ctx as never);

      const result = await caller.removeDomain({ id: 'd1d1d1d1-e2e2-4f3f-8a4a-b5b5b5b5b5b5' });

      expect(result).toEqual({ success: true });
      expect(invalidateSiteCache).toHaveBeenCalledWith('old.com');
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'domain.removed' })
      );
    });
  });

  // ── addMember / removeMember ────────────────────────────────────────────

  describe('addMember', () => {
    it('adds member and audits', async () => {
      const member = { siteId: SITE_ACTIVE.id, userId: 'user-2', role: 'editor' };
      const ctx = createCtx({
        insertResults: [[member]],
      });
      const caller = sitesRouter.createCaller(ctx as never);

      const result = await caller.addMember({ siteId: SITE_ACTIVE.id, userId: 'user-2', role: 'editor' });

      expect(result).toEqual(member);
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'member.added', metadata: expect.objectContaining({ role: 'editor' }) })
      );
    });
  });

  describe('removeMember', () => {
    it('removes member and audits', async () => {
      const ctx = createCtx();
      const caller = sitesRouter.createCaller(ctx as never);

      const result = await caller.removeMember({ siteId: SITE_ACTIVE.id, userId: 'user-2' });

      expect(result).toEqual({ success: true });
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'member.removed' })
      );
    });
  });

  // ── clone ───────────────────────────────────────────────────────────────

  describe('clone', () => {
    it('throws NOT_FOUND when source does not exist', async () => {
      const ctx = createCtx({ selectResults: [[]] });
      const caller = sitesRouter.createCaller(ctx as never);

      await expect(
        caller.clone({ sourceSiteId: '00000000-0000-4000-8000-000000000000', name: 'Clone' })
      ).rejects.toThrow('Source site not found');
    });

    it('clones site and dispatches webhook with clonedFrom', async () => {
      const cloned = { ...SITE_ACTIVE, id: 'd4d4d4d4-e5e5-4f6f-8a7a-b8b8b8b8b8b8', name: 'Cloned', slug: 'cloned' };
      const ctx = createCtx({
        selectResults: [[SITE_ACTIVE]],   // source lookup
        insertResults: [
          [cloned],                        // new site insert
          [{}],                            // member insert
        ],
      });

      // Mock the dedicated clone connection's execute calls
      mockCloneExecute
        .mockResolvedValueOnce([{ tablename: 'cms_posts' }])  // pg_tables
        .mockResolvedValueOnce(undefined)                       // SET CONSTRAINTS
        .mockResolvedValueOnce(undefined)                       // INSERT cms_posts
        .mockResolvedValueOnce(undefined);                      // SET CONSTRAINTS IMMEDIATE

      const caller = sitesRouter.createCaller(ctx as never);

      const result = await caller.clone({ sourceSiteId: SITE_ACTIVE.id, name: 'Cloned' });

      expect(result.name).toBe('Cloned');
      expect(mockCloneEnd).toHaveBeenCalled();  // Connection cleaned up
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'site.cloned',
          metadata: expect.objectContaining({ sourceId: SITE_ACTIVE.id }),
        })
      );
      expect(dispatchWebhook).toHaveBeenCalledWith(
        ctx.db, 'site.created',
        expect.objectContaining({ clonedFrom: SITE_ACTIVE.id })
      );
    });
  });

  // ── setActive ───────────────────────────────────────────────────────────

  describe('setActive', () => {
    it('allows superadmin to set any site', async () => {
      const ctx = createCtx({ role: 'superadmin' });
      const caller = sitesRouter.createCaller(ctx as never);

      const result = await caller.setActive({ siteId: SITE_ACTIVE.id });

      expect(result).toEqual({ siteId: SITE_ACTIVE.id });
    });

    it('rejects staff without membership', async () => {
      const ctx = createCtx({
        role: 'editor',
        selectResults: [[]],  // no membership found
      });
      const caller = sitesRouter.createCaller(ctx as never);

      await expect(caller.setActive({ siteId: SITE_ACTIVE.id }))
        .rejects.toThrow('No access to this site');
    });

    it('allows staff with membership', async () => {
      const ctx = createCtx({
        role: 'editor',
        selectResults: [[{ siteId: SITE_ACTIVE.id }]],  // membership found
      });
      const caller = sitesRouter.createCaller(ctx as never);

      const result = await caller.setActive({ siteId: SITE_ACTIVE.id });

      expect(result).toEqual({ siteId: SITE_ACTIVE.id });
    });

    it('allows clearing active site', async () => {
      const ctx = createCtx({ role: 'editor' });
      const caller = sitesRouter.createCaller(ctx as never);

      const result = await caller.setActive({ siteId: null });

      expect(result).toEqual({ siteId: null });
    });
  });
});
