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

vi.mock('@/core/lib/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

vi.mock('@/core/lib/trpc-rate-limit', () => ({
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
  isSuperAdmin: vi.fn((role: string) => role === 'superadmin'),
}));

vi.mock('@/core/lib/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/core/lib/logger', () => ({
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

vi.mock('@/core/lib/slug', () => ({
  slugify: vi.fn((s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  ),
}));

vi.mock('@/core-import/lib/importers/csv', () => ({
  parseCSV: vi.fn(),
}));

vi.mock('@/core-import/lib/importers/ghost', () => ({
  parseGhostJSON: vi.fn(),
}));

vi.mock('@/core-import/lib/importers/wordpress', () => ({
  parseWordPressWXR: vi.fn(),
}));

vi.mock('@/server/db/schema', () => ({
  cmsPosts: {
    id: 'cms_posts.id',
    title: 'cms_posts.title',
    slug: 'cms_posts.slug',
    content: 'cms_posts.content',
    type: 'cms_posts.type',
    status: 'cms_posts.status',
    lang: 'cms_posts.lang',
    publishedAt: 'cms_posts.published_at',
    metaDescription: 'cms_posts.meta_description',
    seoTitle: 'cms_posts.seo_title',
    previewToken: 'cms_posts.preview_token',
    authorId: 'cms_posts.author_id',
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
import { importRouter } from '@/core-import/routers/import';
import { parseCSV } from '@/core-import/lib/importers/csv';
import { parseGhostJSON } from '@/core-import/lib/importers/ghost';
import { parseWordPressWXR } from '@/core-import/lib/importers/wordpress';
import { logAudit } from '@/core/lib/audit';
import { createMockCtx } from '@/server/routers/__tests__/test-helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock ctx with a db that has both `.query.cmsPosts.findFirst` (Drizzle
 * relational API used by the execute procedure for slug deduplication) and the
 * standard query-builder chain used for inserts.
 */
function createImportCtx(overrides: Record<string, unknown> = {}) {
  const base = createMockCtx(overrides);

  // Drizzle relational query API — default: no existing post (slug is free)
  const findFirstMock = vi.fn().mockResolvedValue(undefined);

  return {
    ...base,
    db: {
      ...base.db,
      query: {
        cmsPosts: {
          findFirst: findFirstMock,
        },
      },
      _findFirstMock: findFirstMock,
    },
  };
}

const SAMPLE_ITEMS = [
  {
    title: 'Hello World',
    slug: 'hello-world',
    content: '# Hello\n\nContent here.',
    status: 'published' as const,
    publishedAt: '2025-01-15T10:00:00Z',
    metaDescription: 'A sample post',
    seoTitle: 'Hello World - My Site',
  },
  {
    title: 'Second Post',
    slug: 'second-post',
    content: 'Another post.',
    status: 'draft' as const,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('importRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // preview
  // =========================================================================
  describe('preview', () => {
    it('delegates to parseWordPressWXR for wordpress format', async () => {
      const mockResult = { items: [], warnings: [] };
      asMock(parseWordPressWXR).mockReturnValue(mockResult);

      const ctx = createMockCtx();
      const caller = importRouter.createCaller(ctx as never);
      const result = await caller.preview({
        content: '<rss>...</rss>',
        format: 'wordpress',
      });

      expect(parseWordPressWXR).toHaveBeenCalledWith('<rss>...</rss>');
      expect(result).toEqual(mockResult);
    });

    it('delegates to parseGhostJSON for ghost format', async () => {
      const mockResult = { items: [{ title: 'Ghost Post', slug: 'ghost-post', content: '', status: 'published' }], warnings: [] };
      asMock(parseGhostJSON).mockReturnValue(mockResult);

      const ctx = createMockCtx();
      const caller = importRouter.createCaller(ctx as never);
      const result = await caller.preview({
        content: '{"db":[]}',
        format: 'ghost',
      });

      expect(parseGhostJSON).toHaveBeenCalledWith('{"db":[]}');
      expect(result).toEqual(mockResult);
    });

    it('delegates to parseCSV with columnMap for csv format', async () => {
      const mockResult = { items: [], warnings: ['No data rows'] };
      asMock(parseCSV).mockReturnValue(mockResult);

      const ctx = createMockCtx();
      const caller = importRouter.createCaller(ctx as never);
      const result = await caller.preview({
        content: 'title,content\n',
        format: 'csv',
        columnMap: { title: 'post_title', content: 'post_content' },
      });

      expect(parseCSV).toHaveBeenCalledWith(
        'title,content\n',
        { title: 'post_title', content: 'post_content' }
      );
      expect(result).toEqual(mockResult);
    });

    it('passes empty columnMap to parseCSV when not provided', async () => {
      asMock(parseCSV).mockReturnValue({ items: [], warnings: [] });

      const ctx = createMockCtx();
      const caller = importRouter.createCaller(ctx as never);
      await caller.preview({ content: 'title\nhello', format: 'csv' });

      expect(parseCSV).toHaveBeenCalledWith('title\nhello', {});
    });

    it('rejects content larger than 50MB', async () => {
      const ctx = createMockCtx();
      const caller = importRouter.createCaller(ctx as never);

      // 50MB + 1 byte
      const hugeContent = 'x'.repeat(50_000_001);

      await expect(
        caller.preview({ content: hugeContent, format: 'csv' })
      ).rejects.toThrow();
    });

    it('rejects unknown format values', async () => {
      const ctx = createMockCtx();
      const caller = importRouter.createCaller(ctx as never);

      await expect(
        caller.preview({ content: 'data', format: 'json' as never })
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // execute
  // =========================================================================
  describe('execute', () => {
    it('inserts all items and returns created count', async () => {
      const ctx = createImportCtx();

      const caller = importRouter.createCaller(ctx as never);
      const result = await caller.execute({ items: SAMPLE_ITEMS });

      expect(result.created).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(ctx.db.insert).toHaveBeenCalledTimes(2);
    });

    it('uses PostType.BLOG (2) as default type', async () => {
      const ctx = createImportCtx();
      const valuesCapture: unknown[] = [];
      ctx.db._chains.insert.values.mockImplementation((vals: unknown) => {
        valuesCapture.push(vals);
        return { returning: vi.fn().mockResolvedValue([]) };
      });

      const caller = importRouter.createCaller(ctx as never);
      await caller.execute({ items: [SAMPLE_ITEMS[0]] });

      expect(valuesCapture[0]).toMatchObject({ type: 2 });
    });

    it('uses postType override when provided', async () => {
      const ctx = createImportCtx();
      const valuesCapture: unknown[] = [];
      ctx.db._chains.insert.values.mockImplementation((vals: unknown) => {
        valuesCapture.push(vals);
        return { returning: vi.fn().mockResolvedValue([]) };
      });

      const caller = importRouter.createCaller(ctx as never);
      await caller.execute({ items: [SAMPLE_ITEMS[0]], postType: 1 });

      expect(valuesCapture[0]).toMatchObject({ type: 1 });
    });

    it('deduplicates slugs when a conflict exists', async () => {
      const ctx = createImportCtx();

      // First findFirst call: slug 'hello-world' is taken → suffix to 'hello-world-1'
      // Second findFirst call: 'hello-world-1' is free
      (ctx.db._findFirstMock as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ id: 'existing' }) // hello-world taken
        .mockResolvedValueOnce(undefined);          // hello-world-1 free

      const valuesCapture: unknown[] = [];
      ctx.db._chains.insert.values.mockImplementation((vals: unknown) => {
        valuesCapture.push(vals);
        return { returning: vi.fn().mockResolvedValue([]) };
      });

      const caller = importRouter.createCaller(ctx as never);
      await caller.execute({ items: [SAMPLE_ITEMS[0]] });

      expect(valuesCapture[0]).toMatchObject({ slug: 'hello-world-1' });
    });

    it('sets status to PUBLISHED (1) for published items', async () => {
      const ctx = createImportCtx();
      const valuesCapture: unknown[] = [];
      ctx.db._chains.insert.values.mockImplementation((vals: unknown) => {
        valuesCapture.push(vals);
        return { returning: vi.fn().mockResolvedValue([]) };
      });

      const caller = importRouter.createCaller(ctx as never);
      await caller.execute({ items: [SAMPLE_ITEMS[0]] }); // status: 'published'

      // ContentStatus.PUBLISHED = 1
      expect(valuesCapture[0]).toMatchObject({ status: 1 });
    });

    it('sets status to DRAFT (0) for draft items', async () => {
      const ctx = createImportCtx();
      const valuesCapture: unknown[] = [];
      ctx.db._chains.insert.values.mockImplementation((vals: unknown) => {
        valuesCapture.push(vals);
        return { returning: vi.fn().mockResolvedValue([]) };
      });

      const caller = importRouter.createCaller(ctx as never);
      await caller.execute({ items: [SAMPLE_ITEMS[1]] }); // status: 'draft'

      // ContentStatus.DRAFT = 0
      expect(valuesCapture[0]).toMatchObject({ status: 0 });
    });

    it('defaultStatus overrides per-item status', async () => {
      const ctx = createImportCtx();
      const valuesCapture: unknown[] = [];
      ctx.db._chains.insert.values.mockImplementation((vals: unknown) => {
        valuesCapture.push(vals);
        return { returning: vi.fn().mockResolvedValue([]) };
      });

      const caller = importRouter.createCaller(ctx as never);
      // Item says 'published' but defaultStatus forces 'draft'
      await caller.execute({ items: [SAMPLE_ITEMS[0]], defaultStatus: 'draft' });

      expect(valuesCapture[0]).toMatchObject({ status: 0 });
    });

    it('sets authorId from session user', async () => {
      const ctx = createImportCtx({
        session: { user: { id: 'author-uuid', email: 'author@test.com', role: 'editor' } },
      });
      const valuesCapture: unknown[] = [];
      ctx.db._chains.insert.values.mockImplementation((vals: unknown) => {
        valuesCapture.push(vals);
        return { returning: vi.fn().mockResolvedValue([]) };
      });

      const caller = importRouter.createCaller(ctx as never);
      await caller.execute({ items: [SAMPLE_ITEMS[0]] });

      expect(valuesCapture[0]).toMatchObject({ authorId: 'author-uuid' });
    });

    it('counts insert failures as skipped and collects error messages', async () => {
      const ctx = createImportCtx();

      // Make insert throw on the first item
      ctx.db._chains.insert.values
        .mockImplementationOnce(() => {
          throw new Error('DB constraint violation');
        })
        .mockReturnValue({ returning: vi.fn().mockResolvedValue([]) });

      const caller = importRouter.createCaller(ctx as never);
      const result = await caller.execute({ items: SAMPLE_ITEMS });

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Hello World');
      expect(result.errors[0]).toContain('DB constraint violation');
    });

    it('calls logAudit after the full import with summary metadata', async () => {
      const ctx = createImportCtx({
        session: { user: { id: 'admin-id', email: 'admin@test.com', role: 'admin' } },
      });

      const caller = importRouter.createCaller(ctx as never);
      await caller.execute({ items: SAMPLE_ITEMS });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-id',
          action: 'import',
          entityType: 'post',
          metadata: expect.objectContaining({ created: 2, skipped: 0 }),
        })
      );
    });

    it('rejects item arrays larger than 500', async () => {
      const ctx = createImportCtx();
      const caller = importRouter.createCaller(ctx as never);

      const tooMany = Array.from({ length: 501 }, (_, i) => ({
        title: `Post ${i}`,
        slug: `post-${i}`,
        content: 'body',
        status: 'draft' as const,
      }));

      await expect(
        caller.execute({ items: tooMany })
      ).rejects.toThrow();
    });

    it('slugifies title when slug field contains only special chars', async () => {
      const ctx = createImportCtx();
      const valuesCapture: unknown[] = [];
      ctx.db._chains.insert.values.mockImplementation((vals: unknown) => {
        valuesCapture.push(vals);
        return { returning: vi.fn().mockResolvedValue([]) };
      });

      const caller = importRouter.createCaller(ctx as never);
      await caller.execute({
        items: [{ title: 'My Test Post', slug: 'my-test-post', content: '', status: 'draft' }],
      });

      expect(valuesCapture[0]).toMatchObject({ slug: 'my-test-post' });
    });

    it('sets publishedAt from item when provided and status is published', async () => {
      const ctx = createImportCtx();
      const valuesCapture: unknown[] = [];
      ctx.db._chains.insert.values.mockImplementation((vals: unknown) => {
        valuesCapture.push(vals);
        return { returning: vi.fn().mockResolvedValue([]) };
      });

      const caller = importRouter.createCaller(ctx as never);
      await caller.execute({ items: [SAMPLE_ITEMS[0]] }); // has publishedAt

      const inserted = valuesCapture[0] as Record<string, unknown>;
      expect(inserted.publishedAt).toBeInstanceOf(Date);
      expect((inserted.publishedAt as Date).toISOString()).toBe('2025-01-15T10:00:00.000Z');
    });

    it('sets publishedAt to null for draft items with no publishedAt', async () => {
      const ctx = createImportCtx();
      const valuesCapture: unknown[] = [];
      ctx.db._chains.insert.values.mockImplementation((vals: unknown) => {
        valuesCapture.push(vals);
        return { returning: vi.fn().mockResolvedValue([]) };
      });

      const caller = importRouter.createCaller(ctx as never);
      await caller.execute({ items: [SAMPLE_ITEMS[1]] }); // draft, no publishedAt

      const inserted = valuesCapture[0] as Record<string, unknown>;
      expect(inserted.publishedAt).toBeNull();
    });
  });
});
