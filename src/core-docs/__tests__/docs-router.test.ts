import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external dependencies BEFORE imports
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

vi.mock('@/core/lib/infra/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, retryAfterMs: 0 }),
}));

vi.mock('@/core/lib/api/trpc-rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

vi.mock('@/core/policy', () => ({
  Policy: {
    for: vi.fn().mockReturnValue({
      canAccessAdmin: vi.fn().mockReturnValue(true),
      can: vi.fn().mockReturnValue(true),
    }),
  },
  Role: { USER: 'user', EDITOR: 'editor', ADMIN: 'admin', SUPERADMIN: 'superadmin' },
}));

vi.mock('@/core/crud/admin-crud', () => ({
  parsePagination: vi.fn().mockImplementation((input: { page?: number; pageSize?: number }) => {
    const page = input?.page ?? 1;
    const pageSize = input?.pageSize ?? 50;
    return { page, pageSize, offset: (page - 1) * pageSize };
  }),
  paginatedResult: vi.fn().mockImplementation(
    (items: unknown[], total: number, page: number, pageSize: number) => ({
      results: items, total, page, pageSize, totalPages: Math.ceil(total / pageSize),
    })
  ),
}));

vi.mock('@/core/lib/content/slug', () => ({
  slugify: vi.fn().mockImplementation((s: string) => s.toLowerCase().replace(/\s+/g, '-')),
}));

vi.mock('@/core-docs/schema/docs', () => ({
  cmsDocs: {
    id: 'cms_docs.id',
    slug: 'cms_docs.slug',
    title: 'cms_docs.title',
    body: 'cms_docs.body',
    bodyText: 'cms_docs.body_text',
    section: 'cms_docs.section',
    sortOrder: 'cms_docs.sort_order',
    parentId: 'cms_docs.parent_id',
    metaTitle: 'cms_docs.meta_title',
    metaDescription: 'cms_docs.meta_description',
    metadata: 'cms_docs.metadata',
    status: 'cms_docs.status',
    createdAt: 'cms_docs.created_at',
    updatedAt: 'cms_docs.updated_at',
  },
}));

const mockGetDocBySlug = vi.fn();
const mockGetDocsNavigation = vi.fn();
const mockSearchDocs = vi.fn();
const mockGenerateLlmExport = vi.fn();

vi.mock('@/core-docs/lib/docs-service', () => ({
  getDocBySlug: (...args: unknown[]) => mockGetDocBySlug(...args),
  getDocsNavigation: (...args: unknown[]) => mockGetDocsNavigation(...args),
  searchDocs: (...args: unknown[]) => mockSearchDocs(...args),
  generateLlmExport: (...args: unknown[]) => mockGenerateLlmExport(...args),
}));

vi.mock('@/core-docs/lib/docs-loader', () => ({
  stripHtml: vi.fn().mockImplementation((s: string) => s.replace(/<[^>]*>/g, '')),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { docsRouter } from '@/core-docs/routers/docs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPublicCtx() {
  return {
    session: null,
    headers: new Headers(),
  };
}

function createAdminCtx() {
  return {
    session: {
      user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' },
      session: { id: 'session-1' },
    },
    headers: new Headers(),
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
              limit: vi.fn().mockResolvedValue([]),
            }),
            limit: vi.fn().mockResolvedValue([]),
          }),
          orderBy: vi.fn().mockReturnValue({
            offset: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
            limit: vi.fn().mockResolvedValue([]),
          }),
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('docsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBySlug', () => {
    it('returns a doc when found', async () => {
      mockGetDocBySlug.mockResolvedValue({
        slug: 'getting-started',
        title: 'Getting Started',
        body: '<p>Welcome</p>',
        source: 'cms',
      });

      const caller = docsRouter.createCaller(createPublicCtx() as never);
      const result = await caller.getBySlug({ slug: 'getting-started' });

      expect(result.title).toBe('Getting Started');
      expect(mockGetDocBySlug).toHaveBeenCalledWith('getting-started');
    });

    it('throws NOT_FOUND when doc does not exist', async () => {
      mockGetDocBySlug.mockResolvedValue(null);

      const caller = docsRouter.createCaller(createPublicCtx() as never);
      await expect(
        caller.getBySlug({ slug: 'nonexistent' })
      ).rejects.toThrow('Documentation page not found');
    });
  });

  describe('getNavigation', () => {
    it('returns navigation tree', async () => {
      mockGetDocsNavigation.mockResolvedValue([
        { slug: 'intro', title: 'Introduction', section: 'Getting Started', children: [] },
      ]);

      const caller = docsRouter.createCaller(createPublicCtx() as never);
      const result = await caller.getNavigation();

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Introduction');
    });
  });

  describe('search', () => {
    it('returns search results', async () => {
      mockSearchDocs.mockResolvedValue([
        { slug: 'install', title: 'Installation', excerpt: '...install the module...' },
      ]);

      const caller = docsRouter.createCaller(createPublicCtx() as never);
      const result = await caller.search({ query: 'install' });

      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe('install');
    });
  });

  describe('llmExport', () => {
    it('returns full text export', async () => {
      mockGenerateLlmExport.mockResolvedValue('# Documentation\n\nContent here.');

      const caller = docsRouter.createCaller(createPublicCtx() as never);
      const result = await caller.llmExport();

      expect(result.content).toContain('# Documentation');
    });
  });

  describe('adminCreate', () => {
    it('creates a doc with auto-generated slug', async () => {
      const ctx = createAdminCtx();
      const caller = docsRouter.createCaller(ctx as never);

      const result = await caller.adminCreate({
        title: 'New Page',
      });

      expect(result.slug).toBe('new-page');
      expect(result.id).toBeDefined();
      expect(ctx.db.insert).toHaveBeenCalled();
    });
  });

  describe('adminDelete', () => {
    it('deletes a doc', async () => {
      const ctx = createAdminCtx();
      const caller = docsRouter.createCaller(ctx as never);

      const result = await caller.adminDelete({ id: 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4' });

      expect(result.success).toBe(true);
      expect(ctx.db.delete).toHaveBeenCalled();
    });
  });
});
