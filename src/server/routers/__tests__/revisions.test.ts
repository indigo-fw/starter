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

vi.mock('@/core/crud/content-revisions', () => ({
  getRevisions: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/core/lib/infra/audit', () => ({
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
  cmsContentRevisions: {
    id: 'cms_content_revisions.id',
    contentType: 'cms_content_revisions.content_type',
    contentId: 'cms_content_revisions.content_id',
    snapshot: 'cms_content_revisions.snapshot',
    createdBy: 'cms_content_revisions.created_by',
    createdAt: 'cms_content_revisions.created_at',
  },
  cmsPosts: {
    id: 'cms_posts.id',
    updatedAt: 'cms_posts.updated_at',
  },
  cmsCategories: {
    id: 'cms_categories.id',
    updatedAt: 'cms_categories.updated_at',
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

import { asMock } from '@/test-utils';
import { revisionsRouter } from '../revisions';
import { getRevisions } from '@/core/crud/content-revisions';
import { logAudit } from '@/core/lib/infra/audit';
import { createMockCtx } from './test-helpers';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REVISION_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const CONTENT_ID = 'f1e2d3c4-b5a6-4978-8b9c-a0d1e2f3a4b5';

const MOCK_POST_REVISION = {
  id: REVISION_ID,
  contentType: 'post',
  contentId: CONTENT_ID,
  snapshot: {
    title: 'Old Title',
    slug: 'old-title',
    content: 'Old content',
    status: 1,
    metaDescription: 'Old meta',
    seoTitle: null,
    featuredImage: null,
    featuredImageAlt: null,
    jsonLd: null,
    noindex: false,
    publishedAt: new Date('2025-01-01').toISOString(),
    lang: 'en',
  },
  createdBy: 'user-1',
  createdAt: new Date('2025-01-01'),
};

const MOCK_CATEGORY_REVISION = {
  id: 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6',
  contentType: 'category',
  contentId: CONTENT_ID,
  snapshot: {
    name: 'Old Category',
    slug: 'old-category',
    title: 'Old Title',
    text: 'Old text',
    status: 1,
    metaDescription: 'Old meta',
    seoTitle: null,
    icon: null,
    order: 0,
    noindex: false,
    publishedAt: null,
    lang: 'en',
  },
  createdBy: 'user-1',
  createdAt: new Date('2025-01-02'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('revisionsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // list
  // =========================================================================
  describe('list', () => {
    it('returns revisions for a content item', async () => {
      const revisions = [MOCK_POST_REVISION, { ...MOCK_POST_REVISION, id: 'c3d4e5f6-a7b8-4c9d-ae0f-1a2b3c4d5e6f' }];
      asMock(getRevisions).mockResolvedValue(revisions);

      const ctx = createMockCtx();
      const caller = revisionsRouter.createCaller(ctx as never);
      const result = await caller.list({
        contentType: 'post',
        contentId: CONTENT_ID,
      });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(REVISION_ID);
      expect(getRevisions).toHaveBeenCalledWith(ctx.db, 'post', CONTENT_ID, 50);
    });

    it('passes custom limit to getRevisions', async () => {
      asMock(getRevisions).mockResolvedValue([]);

      const ctx = createMockCtx();
      const caller = revisionsRouter.createCaller(ctx as never);
      await caller.list({ contentType: 'post', contentId: CONTENT_ID, limit: 10 });

      expect(getRevisions).toHaveBeenCalledWith(ctx.db, 'post', CONTENT_ID, 10);
    });

    it('returns empty array when no revisions exist', async () => {
      asMock(getRevisions).mockResolvedValue([]);

      const ctx = createMockCtx();
      const caller = revisionsRouter.createCaller(ctx as never);
      const result = await caller.list({ contentType: 'blog', contentId: CONTENT_ID });

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // get
  // =========================================================================
  describe('get', () => {
    it('returns a single revision by id', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_POST_REVISION]);

      const caller = revisionsRouter.createCaller(ctx as never);
      const result = await caller.get({ id: REVISION_ID });

      expect(result.id).toBe(REVISION_ID);
      expect(result.contentType).toBe('post');
      expect(result.contentId).toBe(CONTENT_ID);
    });

    it('throws NOT_FOUND when revision does not exist', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = revisionsRouter.createCaller(ctx as never);

      await expect(
        caller.get({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4' })
      ).rejects.toThrow('Revision not found');
    });
  });

  // =========================================================================
  // restore
  // =========================================================================
  describe('restore', () => {
    it('restores a post revision — updates cmsPosts with safe snapshot fields', async () => {
      const ctx = createMockCtx();
      // First select: fetch revision; second select chain not used here
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_POST_REVISION]);

      const caller = revisionsRouter.createCaller(ctx as never);
      const result = await caller.restore({ id: REVISION_ID });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Old Title',
          slug: 'old-title',
          content: 'Old content',
          updatedAt: expect.any(Date),
        })
      );
    });

    it('restores a category revision — updates cmsCategories with safe snapshot fields', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_CATEGORY_REVISION]);

      const caller = revisionsRouter.createCaller(ctx as never);
      const result = await caller.restore({ id: MOCK_CATEGORY_REVISION.id });

      expect(result).toEqual({ success: true });
      expect(ctx.db.update).toHaveBeenCalled();
      expect(ctx.db._chains.update.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Old Category',
          slug: 'old-category',
          updatedAt: expect.any(Date),
        })
      );
    });

    it('throws NOT_FOUND when revision does not exist', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = revisionsRouter.createCaller(ctx as never);

      await expect(
        caller.restore({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4' })
      ).rejects.toThrow('Revision not found');
    });

    it('throws BAD_REQUEST for unknown content type', async () => {
      const unknownRevision = {
        ...MOCK_POST_REVISION,
        contentType: 'portfolio',
      };
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([unknownRevision]);

      const caller = revisionsRouter.createCaller(ctx as never);

      await expect(
        caller.restore({ id: REVISION_ID })
      ).rejects.toThrow('Unknown content type: portfolio');
    });

    it('throws BAD_REQUEST when snapshot has no restorable post fields', async () => {
      const emptySnapshotRevision = {
        ...MOCK_POST_REVISION,
        snapshot: { authorId: 'user-2', deletedAt: null }, // only non-safe fields
      };
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([emptySnapshotRevision]);

      const caller = revisionsRouter.createCaller(ctx as never);

      await expect(
        caller.restore({ id: REVISION_ID })
      ).rejects.toThrow('Revision snapshot contains no restorable fields');
    });

    it('calls logAudit after a successful restore', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_POST_REVISION]);

      const caller = revisionsRouter.createCaller(ctx as never);
      await caller.restore({ id: REVISION_ID });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'revision.restore',
          entityType: 'post',
          entityId: CONTENT_ID,
          metadata: { revisionId: REVISION_ID },
        })
      );
    });

    it('does not call logAudit when restore fails (NOT_FOUND)', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = revisionsRouter.createCaller(ctx as never);

      await expect(caller.restore({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4' })).rejects.toThrow();
      expect(logAudit).not.toHaveBeenCalled();
    });
  });
});
