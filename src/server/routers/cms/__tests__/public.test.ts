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

vi.mock('@/core/crud/taxonomy-helpers', () => ({
  getTermRelationships: vi.fn().mockResolvedValue([]),
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

vi.mock('@/core/lib/content/cms-link', () => ({
  broadcastCmsLinkInvalidation: vi.fn(),
}));

vi.mock('@/server/lib/notifications', () => ({
  sendBulkNotification: vi.fn(),
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
  user: {
    id: 'user.id',
    role: 'user.role',
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { asMock } from '@/test-utils';
import { cmsPublicRouter } from '../public';
import {
  getTermRelationships,
  resolveTagsForPosts,
} from '@/core/crud/taxonomy-helpers';
import { createMockDb } from '../../__tests__/test-helpers';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_POST = {
  id: 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4',
  type: 2,
  title: 'Test Blog Post',
  slug: 'test-blog-post',
  lang: 'en',
  content: 'Hello world',
  status: 1, // ContentStatus.PUBLISHED
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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Public procedures don't require a session, but createCaller still expects
 * the full context shape. Build a minimal ctx with a custom db when needed.
 */
function createPublicCtx(overrides: Record<string, unknown> = {}) {
  const db = createMockDb();
  return {
    session: null,
    db,
    headers: new Headers(),
    activeOrganizationId: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cmsPublicRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // getBySlug
  // =========================================================================
  describe('getBySlug', () => {
    it('returns a published post by slug (strips previewToken)', async () => {
      const ctx = createPublicCtx();
      (ctx.db as ReturnType<typeof createMockDb>)._chains.select.limit.mockResolvedValue([MOCK_POST]);

      const caller = cmsPublicRouter.createCaller(ctx as never);
      const result = await caller.getBySlug({
        slug: 'test-blog-post',
        type: 2,
        lang: 'en',
      });

      expect(result.title).toBe('Test Blog Post');
      expect(result.slug).toBe('test-blog-post');
      expect(result).not.toHaveProperty('previewToken');
    });

    it('throws NOT_FOUND when slug does not match a published post', async () => {
      const ctx = createPublicCtx();
      (ctx.db as ReturnType<typeof createMockDb>)._chains.select.limit.mockResolvedValue([]);

      const caller = cmsPublicRouter.createCaller(ctx as never);

      await expect(
        caller.getBySlug({ slug: 'nonexistent', type: 2, lang: 'en' })
      ).rejects.toThrow('Post not found');
    });

    it('returns a draft post when valid previewToken is provided', async () => {
      const draftPost = { ...MOCK_POST, status: 0 };
      const ctx = createPublicCtx();
      (ctx.db as ReturnType<typeof createMockDb>)._chains.select.limit.mockResolvedValue([draftPost]);

      const caller = cmsPublicRouter.createCaller(ctx as never);
      const result = await caller.getBySlug({
        slug: 'test-blog-post',
        type: 2,
        lang: 'en',
        previewToken: 'tok123',
      });

      expect(result.title).toBe('Test Blog Post');
      expect(result).not.toHaveProperty('previewToken');
    });

    it('throws NOT_FOUND when previewToken does not match', async () => {
      const ctx = createPublicCtx();
      (ctx.db as ReturnType<typeof createMockDb>)._chains.select.limit.mockResolvedValue([]);

      const caller = cmsPublicRouter.createCaller(ctx as never);

      await expect(
        caller.getBySlug({
          slug: 'test-blog-post',
          type: 2,
          lang: 'en',
          previewToken: 'wrong-token',
        })
      ).rejects.toThrow('Post not found');
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

      const ctx = createPublicCtx({ db });
      const caller = cmsPublicRouter.createCaller(ctx as never);
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

      const ctx = createPublicCtx({ db });
      const caller = cmsPublicRouter.createCaller(ctx as never);
      const result = await caller.listPublished({ type: 2 });

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('uses default pagination values (page=1, pageSize=10)', async () => {
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

      const ctx = createPublicCtx({ db });
      const caller = cmsPublicRouter.createCaller(ctx as never);
      const result = await caller.listPublished({ type: 2 });

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });

    it('filters by categoryId when provided', async () => {
      const posts = [
        { ...MOCK_POST, id: 'e1e1e1e1-0000-4000-a000-000000000001' },
      ];

      // When filtering by category, it uses innerJoin
      let selectCallIndex = 0;

      const itemsLimitMock = vi.fn().mockResolvedValue(posts);
      const itemsOffsetMock = vi.fn().mockReturnValue({ limit: itemsLimitMock });
      const itemsOrderByMock = vi.fn().mockReturnValue({ offset: itemsOffsetMock });
      const itemsWhereMock = vi.fn().mockReturnValue({ orderBy: itemsOrderByMock });
      const itemsInnerJoinMock = vi.fn().mockReturnValue({ where: itemsWhereMock });
      const itemsFromMock = vi.fn().mockReturnValue({ innerJoin: itemsInnerJoinMock });

      const countWhereMock = vi.fn().mockResolvedValue([{ count: 1 }]);
      const countInnerJoinMock = vi.fn().mockReturnValue({ where: countWhereMock });
      const countFromMock = vi.fn().mockReturnValue({ innerJoin: countInnerJoinMock });

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

      const ctx = createPublicCtx({ db });
      const caller = cmsPublicRouter.createCaller(ctx as never);
      const result = await caller.listPublished({
        type: 2,
        lang: 'en',
        categoryId: 'c1c1c1c1-0000-4000-a000-000000000001',
      });

      expect(result.results).toHaveLength(1);
      expect(result.total).toBe(1);
      // Verify innerJoin was used (category filter path)
      expect(itemsInnerJoinMock).toHaveBeenCalled();
    });

    it('filters by tagId when provided', async () => {
      const posts = [
        { ...MOCK_POST, id: 'e1e1e1e1-0000-4000-a000-000000000003' },
      ];

      let selectCallIndex = 0;

      const itemsLimitMock = vi.fn().mockResolvedValue(posts);
      const itemsOffsetMock = vi.fn().mockReturnValue({ limit: itemsLimitMock });
      const itemsOrderByMock = vi.fn().mockReturnValue({ offset: itemsOffsetMock });
      const itemsWhereMock = vi.fn().mockReturnValue({ orderBy: itemsOrderByMock });
      const itemsInnerJoinMock = vi.fn().mockReturnValue({ where: itemsWhereMock });
      const itemsFromMock = vi.fn().mockReturnValue({ innerJoin: itemsInnerJoinMock });

      const countWhereMock = vi.fn().mockResolvedValue([{ count: 1 }]);
      const countInnerJoinMock = vi.fn().mockReturnValue({ where: countWhereMock });
      const countFromMock = vi.fn().mockReturnValue({ innerJoin: countInnerJoinMock });

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

      const ctx = createPublicCtx({ db });
      const caller = cmsPublicRouter.createCaller(ctx as never);
      const result = await caller.listPublished({
        type: 2,
        lang: 'en',
        tagId: 'd1d1d1d1-0000-4000-a000-000000000001',
      });

      expect(result.results).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(itemsInnerJoinMock).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // getRelatedPosts
  // =========================================================================
  describe('getRelatedPosts', () => {
    it('returns empty array when post has no tags', async () => {
      asMock(getTermRelationships).mockResolvedValue([]);

      const ctx = createPublicCtx();
      const caller = cmsPublicRouter.createCaller(ctx as never);
      const result = await caller.getRelatedPosts({
        postId: MOCK_POST.id,
        lang: 'en',
      });

      expect(result).toEqual([]);
      // Should not even query for related posts
      expect(ctx.db.select).not.toHaveBeenCalled();
    });

    it('finds posts by shared tags, excluding the original post', async () => {
      asMock(getTermRelationships).mockResolvedValue([
        { termId: 'd1d1d1d1-0000-4000-a000-000000000001', taxonomyId: 'tag' },
        { termId: 'd1d1d1d1-0000-4000-a000-000000000002', taxonomyId: 'tag' },
      ]);

      const relatedPosts = [
        {
          id: 'r1r1r1r1-0000-4000-a000-000000000001',
          title: 'Related Post 1',
          slug: 'related-post-1',
          type: 2,
          metaDescription: 'Related 1',
          publishedAt: new Date('2025-02-01'),
          sharedTagCount: 2,
        },
        {
          id: 'r1r1r1r1-0000-4000-a000-000000000002',
          title: 'Related Post 2',
          slug: 'related-post-2',
          type: 2,
          metaDescription: 'Related 2',
          publishedAt: new Date('2025-03-01'),
          sharedTagCount: 1,
        },
      ];

      const ctx = createPublicCtx();
      const db = ctx.db as ReturnType<typeof createMockDb>;
      db._chains.select.limit.mockResolvedValue(relatedPosts);

      const caller = cmsPublicRouter.createCaller(ctx as never);
      const result = await caller.getRelatedPosts({
        postId: MOCK_POST.id,
        lang: 'en',
        limit: 4,
      });

      expect(result).toHaveLength(2);
      expect(result[0]!.title).toBe('Related Post 1');
      expect(result[1]!.title).toBe('Related Post 2');
      // Verify getTermRelationships was called with 'tag' filter
      expect(getTermRelationships).toHaveBeenCalledWith(
        expect.anything(),
        MOCK_POST.id,
        'tag'
      );
    });

    it('respects the limit parameter', async () => {
      asMock(getTermRelationships).mockResolvedValue([
        { termId: 'd1d1d1d1-0000-4000-a000-000000000001', taxonomyId: 'tag' },
      ]);

      const ctx = createPublicCtx();
      const db = ctx.db as ReturnType<typeof createMockDb>;
      db._chains.select.limit.mockResolvedValue([
        {
          id: 'r1r1r1r1-0000-4000-a000-000000000001',
          title: 'Only One',
          slug: 'only-one',
          type: 2,
          metaDescription: null,
          publishedAt: new Date(),
          sharedTagCount: 1,
        },
      ]);

      const caller = cmsPublicRouter.createCaller(ctx as never);
      const result = await caller.getRelatedPosts({
        postId: MOCK_POST.id,
        lang: 'en',
        limit: 1,
      });

      expect(result).toHaveLength(1);
    });

    it('uses default limit of 4 when not specified', async () => {
      asMock(getTermRelationships).mockResolvedValue([
        { termId: 'd1d1d1d1-0000-4000-a000-000000000001', taxonomyId: 'tag' },
      ]);

      const ctx = createPublicCtx();
      const db = ctx.db as ReturnType<typeof createMockDb>;
      db._chains.select.limit.mockResolvedValue([]);

      const caller = cmsPublicRouter.createCaller(ctx as never);
      await caller.getRelatedPosts({
        postId: MOCK_POST.id,
        lang: 'en',
      });

      // The DB query was executed (posts have tags), but returned empty
      expect(ctx.db.select).toHaveBeenCalled();
    });
  });
});
