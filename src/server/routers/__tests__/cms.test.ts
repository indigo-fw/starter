import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock ALL external dependencies BEFORE imports
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

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

vi.mock('@/core/crud/cms-helpers', () => ({
  updateWithRevision: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/core/crud/taxonomy-helpers', () => ({
  syncTermRelationships: vi.fn().mockResolvedValue(undefined),
  getTermRelationships: vi.fn().mockResolvedValue([]),
  deleteAllTermRelationships: vi.fn().mockResolvedValue(undefined),
  resolveTagsForPosts: vi.fn().mockImplementation((_db, items) =>
    items.map((item: Record<string, unknown>) => ({ ...item, tags: [] }))
  ),
}));

vi.mock('@/core/lib/infra/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/core/lib/webhooks/webhooks', () => ({
  dispatchWebhook: vi.fn(),
}));

vi.mock('@/server/lib/notifications', () => ({
  sendBulkNotification: vi.fn(),
}));

vi.mock('@/server/translation/translate-fields', () => ({
  createFieldTranslator: vi.fn(),
}));

vi.mock('@/core/storage', () => ({
  getStorage: vi.fn().mockReturnValue({
    url: vi.fn((path: string) => `/uploads/${path}`),
  }),
}));

vi.mock('@/lib/env', () => ({
  env: {
    DEEPL_API_KEY: undefined,
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

vi.mock('@/lib/constants', () => ({
  LOCALES: ['en'],
  DEFAULT_LOCALE: 'en',
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/core/lib/seo-routes', () => ({
  SEO_OVERRIDE_ROUTES: [],
  SEO_OVERRIDE_SLUGS: new Set<string>(),
}));

vi.mock('@/config/cms', () => ({
  getContentTypeByPostType: vi.fn().mockReturnValue({
    id: 'blog',
    label: 'Blog Post',
    labelPlural: 'Blog Posts',
    urlPrefix: '/blog/',
    postType: 2,
    adminSlug: 'blog',
  }),
}));

vi.mock('@/server/db/schema', () => ({
  cmsPosts: {
    id: 'cms_posts.id',
    type: 'cms_posts.type',
    title: 'cms_posts.title',
    slug: 'cms_posts.slug',
    content: 'cms_posts.content',
    status: 'cms_posts.status',
    lang: 'cms_posts.lang',
    metaDescription: 'cms_posts.meta_description',
    seoTitle: 'cms_posts.seo_title',
    featuredImage: 'cms_posts.featured_image',
    featuredImageAlt: 'cms_posts.featured_image_alt',
    jsonLd: 'cms_posts.json_ld',
    noindex: 'cms_posts.noindex',
    publishedAt: 'cms_posts.published_at',
    translationGroup: 'cms_posts.translation_group',
    fallbackToDefault: 'cms_posts.fallback_to_default',
    parentId: 'cms_posts.parent_id',
    authorId: 'cms_posts.author_id',
    previewToken: 'cms_posts.preview_token',
    createdAt: 'cms_posts.created_at',
    updatedAt: 'cms_posts.updated_at',
    deletedAt: 'cms_posts.deleted_at',
  },
  cmsCategories: {
    id: 'cms_categories.id',
    slug: 'cms_categories.slug',
    status: 'cms_categories.status',
    deletedAt: 'cms_categories.deleted_at',
  },
  cmsTerms: {
    id: 'cms_terms.id',
    slug: 'cms_terms.slug',
    taxonomyId: 'cms_terms.taxonomy_id',
    deletedAt: 'cms_terms.deleted_at',
  },
  cmsTermRelationships: {
    objectId: 'cms_term_relationships.object_id',
    termId: 'cms_term_relationships.term_id',
    taxonomyId: 'cms_term_relationships.taxonomy_id',
  },
  cmsPostAttachments: {
    id: 'cms_post_attachments.id',
    postId: 'cms_post_attachments.post_id',
  },
  user: {
    id: 'user.id',
    role: 'user.role',
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { TRPCError } from '@trpc/server';
import { asMock } from '@/test-utils';
import { cmsRouter } from '../cms';
import { buildStatusCounts, fetchOrNotFound } from '@/core/crud/admin-crud';
import { getTermRelationships, syncTermRelationships, resolveTagsForPosts } from '@/core/crud/taxonomy-helpers';
import { updateWithRevision } from '@/core/crud/cms-helpers';
import { softDelete, softRestore } from '@/core/crud/admin-crud';
import { logAudit } from '@/core/lib/infra/audit';
import { dispatchWebhook } from '@/core/lib/webhooks/webhooks';
import { createMockCtx } from './test-helpers';

const MOCK_POST = {
  id: 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4',
  type: 2,
  title: 'Test Blog Post',
  slug: 'test-blog-post',
  lang: 'en',
  content: 'Hello world',
  status: 1,
  metaDescription: 'A test post',
  seoTitle: null,
  featuredImage: null,
  featuredImageAlt: null,
  jsonLd: null,
  noindex: false,
  publishedAt: new Date('2025-01-01'),
  translationGroup: null,
  fallbackToDefault: null,
  parentId: null,
  authorId: 'user-1',
  previewToken: 'tok123',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cmsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // counts
  // =========================================================================
  describe('counts', () => {
    it('returns status counts for a post type', async () => {
      const mockCounts = { all: 10, published: 5, draft: 3, scheduled: 1, trash: 1 };
      asMock(buildStatusCounts).mockResolvedValue(mockCounts);

      const ctx = createMockCtx();
      const caller = cmsRouter.createCaller(ctx as never);
      const result = await caller.counts({ type: 2 });

      expect(result).toEqual(mockCounts);
      expect(buildStatusCounts).toHaveBeenCalledOnce();
    });

    it('passes the correct type filter to buildStatusCounts', async () => {
      asMock(buildStatusCounts).mockResolvedValue({
        all: 0, published: 0, draft: 0, scheduled: 0, trash: 0,
      });

      const ctx = createMockCtx();
      const caller = cmsRouter.createCaller(ctx as never);
      await caller.counts({ type: 1 });

      expect(buildStatusCounts).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({ table: expect.anything() }),
        expect.anything()
      );
    });
  });

  // =========================================================================
  // get
  // =========================================================================
  describe('get', () => {
    it('returns a post with categoryIds and tagIds', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_POST);

      asMock(getTermRelationships).mockResolvedValue([
        { termId: 'c1c1c1c1-0000-4000-a000-000000000001', taxonomyId: 'category' },
        { termId: 'd1d1d1d1-0000-4000-a000-000000000001', taxonomyId: 'tag' },
        { termId: 'd1d1d1d1-0000-4000-a000-000000000002', taxonomyId: 'tag' },
      ]);

      const caller = cmsRouter.createCaller(ctx as never);
      const result = await caller.get({ id: MOCK_POST.id });

      expect(result.id).toBe(MOCK_POST.id);
      expect(result.title).toBe('Test Blog Post');
      expect(result.categoryIds).toEqual(['c1c1c1c1-0000-4000-a000-000000000001']);
      expect(result.tagIds).toEqual(['d1d1d1d1-0000-4000-a000-000000000001', 'd1d1d1d1-0000-4000-a000-000000000002']);
    });

    it('throws NOT_FOUND when post does not exist', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockRejectedValue(
        new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' })
      );

      const caller = cmsRouter.createCaller(ctx as never);

      await expect(
        caller.get({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4' })
      ).rejects.toThrow('Post not found');
    });

    it('returns empty arrays when post has no taxonomy relationships', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_POST);
      asMock(getTermRelationships).mockResolvedValue([]);

      const caller = cmsRouter.createCaller(ctx as never);
      const result = await caller.get({ id: MOCK_POST.id });

      expect(result.categoryIds).toEqual([]);
      expect(result.tagIds).toEqual([]);
    });
  });

  // =========================================================================
  // create
  // =========================================================================
  describe('create', () => {
    const createInput = {
      type: 2,
      title: 'New Post',
      slug: 'new-post',
      lang: 'en',
      content: 'Some content',
      status: 0,
    };

    it('creates a post and returns it', async () => {
      const createdPost = {
        ...MOCK_POST,
        id: 'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f0',
        title: 'New Post',
        slug: 'new-post',
        status: 0,
      };

      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdPost]);

      const caller = cmsRouter.createCaller(ctx as never);
      const result = await caller.create(createInput);

      expect(result.title).toBe('New Post');
      expect(result.slug).toBe('new-post');
      expect(ctx.db.insert).toHaveBeenCalled();
    });

    it('syncs categories and tags when provided', async () => {
      const createdPost = {
        ...MOCK_POST,
        id: 'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f1',
        title: 'New Post',
        slug: 'new-post',
      };

      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdPost]);

      const caller = cmsRouter.createCaller(ctx as never);
      await caller.create({
        ...createInput,
        categoryIds: ['c1c1c1c1-0000-4000-a000-000000000001', 'c1c1c1c1-0000-4000-a000-000000000002'],
        tagIds: ['d1d1d1d1-0000-4000-a000-000000000001'],
      });

      expect(syncTermRelationships).toHaveBeenCalledWith(
        ctx.db,
        createdPost.id,
        'category',
        ['c1c1c1c1-0000-4000-a000-000000000001', 'c1c1c1c1-0000-4000-a000-000000000002']
      );
      expect(syncTermRelationships).toHaveBeenCalledWith(
        ctx.db,
        createdPost.id,
        'tag',
        ['d1d1d1d1-0000-4000-a000-000000000001']
      );
    });

    it('calls logAudit and dispatchWebhook after creation', async () => {
      const createdPost = {
        ...MOCK_POST,
        id: 'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f2',
        title: 'New Post',
        slug: 'new-post',
      };

      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdPost]);

      const caller = cmsRouter.createCaller(ctx as never);
      await caller.create(createInput);

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          userId: 'user-1',
          action: 'create',
          entityType: 'post',
          entityId: createdPost.id,
          entityTitle: createdPost.title,
        })
      );

      expect(dispatchWebhook).toHaveBeenCalledWith(
        ctx.db,
        'post.created',
        expect.objectContaining({
          id: createdPost.id,
          title: createdPost.title,
        })
      );
    });
  });

  // =========================================================================
  // update
  // =========================================================================
  describe('update', () => {
    it('updates a post via updateWithRevision', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_POST]);

      const caller = cmsRouter.createCaller(ctx as never);
      const result = await caller.update({
        id: MOCK_POST.id,
        title: 'Updated Title',
      });

      expect(result).toEqual({ success: true });
      expect(updateWithRevision).toHaveBeenCalledWith(
        expect.objectContaining({
          db: ctx.db,
          contentId: MOCK_POST.id,
          oldRecord: MOCK_POST,
          userId: 'user-1',
        })
      );
    });

    it('throws NOT_FOUND when updating a nonexistent post', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = cmsRouter.createCaller(ctx as never);

      await expect(
        caller.update({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4', title: 'X' })
      ).rejects.toThrow('Post not found');
    });

    it('syncs taxonomy relationships when categoryIds or tagIds are provided', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_POST]);

      const caller = cmsRouter.createCaller(ctx as never);
      await caller.update({
        id: MOCK_POST.id,
        categoryIds: ['c1c1c1c1-0000-4000-a000-000000000003'],
        tagIds: ['d1d1d1d1-0000-4000-a000-000000000003', 'd1d1d1d1-0000-4000-a000-000000000004'],
      });

      expect(syncTermRelationships).toHaveBeenCalledWith(
        ctx.db,
        MOCK_POST.id,
        'category',
        ['c1c1c1c1-0000-4000-a000-000000000003']
      );
      expect(syncTermRelationships).toHaveBeenCalledWith(
        ctx.db,
        MOCK_POST.id,
        'tag',
        ['d1d1d1d1-0000-4000-a000-000000000003', 'd1d1d1d1-0000-4000-a000-000000000004']
      );
    });

    it('calls logAudit and dispatchWebhook after update', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_POST]);

      const caller = cmsRouter.createCaller(ctx as never);
      await caller.update({ id: MOCK_POST.id, title: 'Updated Title' });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          entityType: 'post',
          entityId: MOCK_POST.id,
          entityTitle: 'Updated Title',
        })
      );

      expect(dispatchWebhook).toHaveBeenCalledWith(
        ctx.db,
        'post.updated',
        expect.objectContaining({ id: MOCK_POST.id, title: 'Updated Title' })
      );
    });
  });

  // =========================================================================
  // delete (soft-delete)
  // =========================================================================
  describe('delete', () => {
    it('calls softDelete and returns success', async () => {
      const ctx = createMockCtx();
      const caller = cmsRouter.createCaller(ctx as never);
      const result = await caller.delete({ id: MOCK_POST.id });

      expect(result).toEqual({ success: true });
      expect(softDelete).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({ table: expect.anything() }),
        MOCK_POST.id
      );
    });

    it('rejects invalid (non-UUID) id', async () => {
      const ctx = createMockCtx();
      const caller = cmsRouter.createCaller(ctx as never);

      await expect(caller.delete({ id: 'not-a-uuid' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // restore
  // =========================================================================
  describe('restore', () => {
    it('calls softRestore and returns success', async () => {
      const ctx = createMockCtx();
      const caller = cmsRouter.createCaller(ctx as never);
      const result = await caller.restore({ id: MOCK_POST.id });

      expect(result).toEqual({ success: true });
      expect(softRestore).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({ table: expect.anything() }),
        MOCK_POST.id
      );
    });

    it('rejects invalid (non-UUID) id', async () => {
      const ctx = createMockCtx();
      const caller = cmsRouter.createCaller(ctx as never);

      await expect(caller.restore({ id: 'bad' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // listPublished
  // =========================================================================
  describe('listPublished', () => {
    it('returns paginated published posts', async () => {
      const posts = [
        { ...MOCK_POST, id: 'e1e1e1e1-0000-4000-a000-000000000001' },
        { ...MOCK_POST, id: 'e1e1e1e1-0000-4000-a000-000000000002' },
      ];

      // listPublished uses Promise.all with two concurrent selects (items + count).
      // We need a mock DB that supports both chains concurrently:
      //   1) select().from().where().orderBy().offset().limit() → items
      //   2) select().from().where() → [{ count: N }]
      // Strategy: use selectMock call index to branch behavior.
      let selectCallIndex = 0;

      const itemsLimitMock = vi.fn().mockResolvedValue(posts);
      const itemsOffsetMock = vi.fn().mockReturnValue({ limit: itemsLimitMock });
      const itemsOrderByMock = vi.fn().mockReturnValue({ offset: itemsOffsetMock });
      const itemsWhereMock = vi.fn().mockReturnValue({ orderBy: itemsOrderByMock });
      const itemsFromMock = vi.fn().mockReturnValue({ where: itemsWhereMock });

      const countWhereMock = vi.fn().mockResolvedValue([{ count: 2 }]);
      const countFromMock = vi.fn().mockReturnValue({ where: countWhereMock });

      const selectMock = vi.fn().mockImplementation(() => {
        selectCallIndex++;
        if (selectCallIndex % 2 === 1) return { from: itemsFromMock };
        return { from: countFromMock };
      });

      const db = {
        select: selectMock,
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };

      asMock(resolveTagsForPosts).mockResolvedValue(
        posts.map((p) => ({ ...p, tags: [] }))
      );

      const ctx = createMockCtx({ db });
      const caller = cmsRouter.createCaller(ctx as never);
      const result = await caller.listPublished({
        type: 2,
        lang: 'en',
        page: 1,
        pageSize: 10,
      });

      expect(result.results).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(1);
      expect(resolveTagsForPosts).toHaveBeenCalled();
    });

    it('returns empty results when no posts match', async () => {
      let selectCallIndex = 0;

      const itemsLimitMock = vi.fn().mockResolvedValue([]);
      const itemsOffsetMock = vi.fn().mockReturnValue({ limit: itemsLimitMock });
      const itemsOrderByMock = vi.fn().mockReturnValue({ offset: itemsOffsetMock });
      const itemsWhereMock = vi.fn().mockReturnValue({ orderBy: itemsOrderByMock });
      const itemsFromMock = vi.fn().mockReturnValue({ where: itemsWhereMock });

      const countWhereMock = vi.fn().mockResolvedValue([{ count: 0 }]);
      const countFromMock = vi.fn().mockReturnValue({ where: countWhereMock });

      const selectMock = vi.fn().mockImplementation(() => {
        selectCallIndex++;
        if (selectCallIndex % 2 === 1) return { from: itemsFromMock };
        return { from: countFromMock };
      });

      const db = {
        select: selectMock,
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };

      asMock(resolveTagsForPosts).mockResolvedValue([]);

      const ctx = createMockCtx({ db });
      const caller = cmsRouter.createCaller(ctx as never);
      const result = await caller.listPublished({ type: 2 });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('uses default pagination values', async () => {
      let selectCallIndex = 0;

      const itemsLimitMock = vi.fn().mockResolvedValue([]);
      const itemsOffsetMock = vi.fn().mockReturnValue({ limit: itemsLimitMock });
      const itemsOrderByMock = vi.fn().mockReturnValue({ offset: itemsOffsetMock });
      const itemsWhereMock = vi.fn().mockReturnValue({ orderBy: itemsOrderByMock });
      const itemsFromMock = vi.fn().mockReturnValue({ where: itemsWhereMock });

      const countWhereMock = vi.fn().mockResolvedValue([{ count: 0 }]);
      const countFromMock = vi.fn().mockReturnValue({ where: countWhereMock });

      const selectMock = vi.fn().mockImplementation(() => {
        selectCallIndex++;
        if (selectCallIndex % 2 === 1) return { from: itemsFromMock };
        return { from: countFromMock };
      });

      const db = {
        select: selectMock,
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };

      asMock(resolveTagsForPosts).mockResolvedValue([]);

      const ctx = createMockCtx({ db });
      const caller = cmsRouter.createCaller(ctx as never);
      const result = await caller.listPublished({ type: 2 });

      // Defaults: page=1, pageSize=10
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });
  });

  // =========================================================================
  // getBySlug
  // =========================================================================
  describe('getBySlug', () => {
    it('returns a published post by slug (strips previewToken)', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_POST]);

      const caller = cmsRouter.createCaller(ctx as never);
      const result = await caller.getBySlug({
        slug: 'test-blog-post',
        type: 2,
        lang: 'en',
      });

      expect(result.title).toBe('Test Blog Post');
      expect(result.slug).toBe('test-blog-post');
      // previewToken must not be in the response
      expect(result).not.toHaveProperty('previewToken');
    });

    it('throws NOT_FOUND when slug does not match a published post', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = cmsRouter.createCaller(ctx as never);

      await expect(
        caller.getBySlug({ slug: 'nonexistent', type: 2, lang: 'en' })
      ).rejects.toThrow('Post not found');
    });

    it('returns a draft post when valid previewToken is provided', async () => {
      const draftPost = { ...MOCK_POST, status: 0 };
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([draftPost]);

      const caller = cmsRouter.createCaller(ctx as never);
      const result = await caller.getBySlug({
        slug: 'test-blog-post',
        type: 2,
        lang: 'en',
        previewToken: 'tok123',
      });

      expect(result.title).toBe('Test Blog Post');
      expect(result).not.toHaveProperty('previewToken');
    });
  });
});
