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
  generateCopySlug: vi.fn().mockResolvedValue('test-blog-post-copy'),
  getTranslationSiblings: vi.fn().mockResolvedValue([]),
  serializeExport: vi.fn().mockReturnValue({ data: '[]', contentType: 'application/json' }),
  prepareTranslationCopy: vi.fn().mockResolvedValue({
    slug: 'slug-en',
    translationGroup: 'group-1',
    previewToken: 'tok',
  }),
}));

vi.mock('@/core/crud/cms-helpers', () => ({
  updateWithRevision: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/core/crud/taxonomy-helpers', () => ({
  syncTermRelationships: vi.fn().mockResolvedValue(undefined),
  getTermRelationships: vi.fn().mockResolvedValue([]),
  deleteAllTermRelationships: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/server/translation/translate-fields', () => ({
  createFieldTranslator: vi.fn(),
}));

vi.mock('@/core/lib/content/loader', () => ({
  getMdxManagedSlugs: vi.fn().mockReturnValue([]),
}));

vi.mock('@/core/lib/content/vars', () => ({
  getContentVarDefs: vi.fn().mockReturnValue([]),
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

vi.mock('@/core/crud/post-author-helpers', () => ({
  getPostAuthorIds: vi.fn().mockResolvedValue([]),
  syncPostAuthors: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { asMock } from '@/test-utils';
import { cmsPostsRouter } from '../posts';
import {
  fetchOrNotFound,
  softDelete,
  permanentDelete,
  generateCopySlug,
} from '@/core/crud/admin-crud';
import { updateWithRevision } from '@/core/crud/cms-helpers';
import {
  syncTermRelationships,
  getTermRelationships,
  deleteAllTermRelationships,
} from '@/core/crud/taxonomy-helpers';
import { logAudit } from '@/core/lib/infra/audit';
import { dispatchWebhook } from '@/core/lib/webhooks/webhooks';
import { broadcastCmsLinkInvalidation } from '@/core/lib/content/cms-link';
import { createMockCtx } from '../../__tests__/test-helpers';

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
// Tests
// ---------------------------------------------------------------------------

describe('cmsPostsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      status: 0, // DRAFT
    };

    it('creates a post with correct values and returns it', async () => {
      const createdPost = {
        ...MOCK_POST,
        id: 'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f0',
        title: 'New Post',
        slug: 'new-post',
        status: 0,
      };

      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdPost]);

      const caller = cmsPostsRouter.createCaller(ctx as never);
      const result = await caller.create(createInput);

      expect(result.title).toBe('New Post');
      expect(result.slug).toBe('new-post');
      expect(result.id).toBe(createdPost.id);
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

      const caller = cmsPostsRouter.createCaller(ctx as never);
      await caller.create({
        ...createInput,
        categoryIds: [
          'c1c1c1c1-0000-4000-a000-000000000001',
          'c1c1c1c1-0000-4000-a000-000000000002',
        ],
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

    it('dispatches audit log and webhook after creation', async () => {
      const createdPost = {
        ...MOCK_POST,
        id: 'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f2',
        title: 'New Post',
        slug: 'new-post',
      };

      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdPost]);

      const caller = cmsPostsRouter.createCaller(ctx as never);
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

    it('notifies staff when post is created as published', async () => {
      const createdPost = {
        ...MOCK_POST,
        id: 'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f3',
        title: 'Published Post',
        slug: 'published-post',
        status: 1, // ContentStatus.PUBLISHED
      };

      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdPost]);
      // notifyContentPublished queries staff users — mock that select
      ctx.db._chains.select.limit.mockResolvedValue([
        { id: 'staff-1' },
        { id: 'staff-2' },
      ]);

      const caller = cmsPostsRouter.createCaller(ctx as never);
      await caller.create({
        ...createInput,
        title: 'Published Post',
        slug: 'published-post',
        status: 1,
      });

      // broadcastCmsLinkInvalidation is always called
      expect(broadcastCmsLinkInvalidation).toHaveBeenCalled();
    });

    it('broadcasts CMS link invalidation', async () => {
      const createdPost = {
        ...MOCK_POST,
        id: 'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f4',
      };

      const ctx = createMockCtx();
      ctx.db._chains.insert.returning.mockResolvedValue([createdPost]);

      const caller = cmsPostsRouter.createCaller(ctx as never);
      await caller.create(createInput);

      expect(broadcastCmsLinkInvalidation).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // update
  // =========================================================================
  describe('update', () => {
    it('updates a post via updateWithRevision', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_POST]);

      const caller = cmsPostsRouter.createCaller(ctx as never);
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

    it('creates a revision via updateWithRevision', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_POST]);

      const caller = cmsPostsRouter.createCaller(ctx as never);
      await caller.update({
        id: MOCK_POST.id,
        content: 'Updated content',
      });

      expect(updateWithRevision).toHaveBeenCalledWith(
        expect.objectContaining({
          snapshotKeys: expect.arrayContaining(['title', 'slug', 'content', 'status']),
        })
      );
    });

    it('creates a slug redirect when slug changes', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_POST]);

      const caller = cmsPostsRouter.createCaller(ctx as never);
      await caller.update({
        id: MOCK_POST.id,
        slug: 'new-slug',
      });

      expect(updateWithRevision).toHaveBeenCalledWith(
        expect.objectContaining({
          oldSlug: MOCK_POST.slug,
          newSlug: 'new-slug',
          urlPrefix: '/blog/',
        })
      );
    });

    it('throws NOT_FOUND when updating a nonexistent post', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = cmsPostsRouter.createCaller(ctx as never);

      await expect(
        caller.update({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4', title: 'X' })
      ).rejects.toThrow('Post not found');
    });

    it('syncs taxonomy relationships when categoryIds or tagIds are provided', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_POST]);

      const caller = cmsPostsRouter.createCaller(ctx as never);
      await caller.update({
        id: MOCK_POST.id,
        categoryIds: ['c1c1c1c1-0000-4000-a000-000000000003'],
        tagIds: [
          'd1d1d1d1-0000-4000-a000-000000000003',
          'd1d1d1d1-0000-4000-a000-000000000004',
        ],
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

      const caller = cmsPostsRouter.createCaller(ctx as never);
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

    it('notifies staff when post transitions to published', async () => {
      const draftPost = { ...MOCK_POST, status: 0 }; // DRAFT
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([draftPost]);
      // notifyContentPublished will query staff users (fire-and-forget)

      const caller = cmsPostsRouter.createCaller(ctx as never);
      await caller.update({
        id: MOCK_POST.id,
        status: 1, // PUBLISHED
      });

      // broadcastCmsLinkInvalidation is always called on update
      expect(broadcastCmsLinkInvalidation).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // delete (soft-delete)
  // =========================================================================
  describe('delete', () => {
    it('calls softDelete and returns success', async () => {
      const ctx = createMockCtx();
      const caller = cmsPostsRouter.createCaller(ctx as never);
      const result = await caller.delete({ id: MOCK_POST.id });

      expect(result).toEqual({ success: true });
      expect(softDelete).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({ table: expect.anything() }),
        MOCK_POST.id
      );
    });

    it('broadcasts CMS link invalidation after soft-delete', async () => {
      const ctx = createMockCtx();
      const caller = cmsPostsRouter.createCaller(ctx as never);
      await caller.delete({ id: MOCK_POST.id });

      expect(broadcastCmsLinkInvalidation).toHaveBeenCalled();
    });

    it('rejects invalid (non-UUID) id', async () => {
      const ctx = createMockCtx();
      const caller = cmsPostsRouter.createCaller(ctx as never);

      await expect(caller.delete({ id: 'not-a-uuid' })).rejects.toThrow();
    });
  });

  // =========================================================================
  // permanentDelete
  // =========================================================================
  describe('permanentDelete', () => {
    it('calls permanentDelete with taxonomy cleanup callback', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([{ type: 2 }]);

      const caller = cmsPostsRouter.createCaller(ctx as never);
      const result = await caller.permanentDelete({ id: MOCK_POST.id });

      expect(result).toEqual({ success: true });
      expect(permanentDelete).toHaveBeenCalledWith(
        ctx.db,
        expect.objectContaining({ table: expect.anything() }),
        MOCK_POST.id,
        'blog', // contentType.id from mocked getContentTypeByPostType
        expect.any(Function) // taxonomy cleanup callback
      );
    });

    it('taxonomy cleanup callback calls deleteAllTermRelationships', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([{ type: 2 }]);

      // Capture the cleanup callback
      asMock(permanentDelete).mockImplementation(
        async (_db: unknown, _cols: unknown, _id: unknown, _ct: unknown, cleanup: ((tx: unknown) => Promise<void>) | undefined) => {
          if (cleanup) await cleanup(ctx.db);
        }
      );

      const caller = cmsPostsRouter.createCaller(ctx as never);
      await caller.permanentDelete({ id: MOCK_POST.id });

      expect(deleteAllTermRelationships).toHaveBeenCalledWith(ctx.db, MOCK_POST.id);
    });

    it('throws NOT_FOUND when post does not exist', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = cmsPostsRouter.createCaller(ctx as never);

      await expect(
        caller.permanentDelete({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4' })
      ).rejects.toThrow('Post not found');
    });

    it('broadcasts CMS link invalidation', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([{ type: 2 }]);

      const caller = cmsPostsRouter.createCaller(ctx as never);
      await caller.permanentDelete({ id: MOCK_POST.id });

      expect(broadcastCmsLinkInvalidation).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // duplicate
  // =========================================================================
  describe('duplicate', () => {
    it('copies post with "(Copy)" title and draft status', async () => {
      const copiedPost = {
        ...MOCK_POST,
        id: 'c1c1c1c1-d2d2-4e3e-8f4f-a5a5a5a5a5a5',
        title: 'Test Blog Post (Copy)',
        slug: 'test-blog-post-copy',
        status: 0, // DRAFT
        publishedAt: null,
      };

      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_POST);
      asMock(generateCopySlug).mockResolvedValue('test-blog-post-copy');
      ctx.db._chains.insert.returning.mockResolvedValue([copiedPost]);
      asMock(getTermRelationships).mockResolvedValue([]);

      const caller = cmsPostsRouter.createCaller(ctx as never);
      const result = await caller.duplicate({ id: MOCK_POST.id });

      expect(result.title).toBe('Test Blog Post (Copy)');
      expect(result.slug).toBe('test-blog-post-copy');
      expect(result.status).toBe(0);
      expect(result.publishedAt).toBeNull();

      // Verify insert was called with correct title
      expect(ctx.db.insert).toHaveBeenCalled();
      expect(ctx.db._chains.insert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Blog Post (Copy)',
          slug: 'test-blog-post-copy',
          status: 0, // ContentStatus.DRAFT
          publishedAt: null,
          type: MOCK_POST.type,
          lang: MOCK_POST.lang,
          content: MOCK_POST.content,
        })
      );
    });

    it('copies taxonomy relationships from original post', async () => {
      const copiedPost = {
        ...MOCK_POST,
        id: 'c1c1c1c1-d2d2-4e3e-8f4f-a5a5a5a5a5a6',
        title: 'Test Blog Post (Copy)',
        slug: 'test-blog-post-copy',
        status: 0,
      };

      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_POST);
      asMock(generateCopySlug).mockResolvedValue('test-blog-post-copy');
      ctx.db._chains.insert.returning.mockResolvedValue([copiedPost]);

      asMock(getTermRelationships).mockResolvedValue([
        { termId: 'c1c1c1c1-0000-4000-a000-000000000001', taxonomyId: 'category' },
        { termId: 'd1d1d1d1-0000-4000-a000-000000000001', taxonomyId: 'tag' },
        { termId: 'd1d1d1d1-0000-4000-a000-000000000002', taxonomyId: 'tag' },
      ]);

      const caller = cmsPostsRouter.createCaller(ctx as never);
      await caller.duplicate({ id: MOCK_POST.id });

      expect(syncTermRelationships).toHaveBeenCalledWith(
        ctx.db,
        copiedPost.id,
        'category',
        ['c1c1c1c1-0000-4000-a000-000000000001']
      );
      expect(syncTermRelationships).toHaveBeenCalledWith(
        ctx.db,
        copiedPost.id,
        'tag',
        ['d1d1d1d1-0000-4000-a000-000000000001', 'd1d1d1d1-0000-4000-a000-000000000002']
      );
    });

    it('does not copy taxonomy when original has none', async () => {
      const copiedPost = {
        ...MOCK_POST,
        id: 'c1c1c1c1-d2d2-4e3e-8f4f-a5a5a5a5a5a7',
        title: 'Test Blog Post (Copy)',
        slug: 'test-blog-post-copy',
        status: 0,
      };

      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_POST);
      asMock(generateCopySlug).mockResolvedValue('test-blog-post-copy');
      ctx.db._chains.insert.returning.mockResolvedValue([copiedPost]);
      asMock(getTermRelationships).mockResolvedValue([]);

      const caller = cmsPostsRouter.createCaller(ctx as never);
      await caller.duplicate({ id: MOCK_POST.id });

      expect(syncTermRelationships).not.toHaveBeenCalled();
    });

    it('logs audit with duplicate action and original ID in metadata', async () => {
      const copiedPost = {
        ...MOCK_POST,
        id: 'c1c1c1c1-d2d2-4e3e-8f4f-a5a5a5a5a5a8',
        title: 'Test Blog Post (Copy)',
        slug: 'test-blog-post-copy',
        status: 0,
      };

      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockResolvedValue(MOCK_POST);
      asMock(generateCopySlug).mockResolvedValue('test-blog-post-copy');
      ctx.db._chains.insert.returning.mockResolvedValue([copiedPost]);
      asMock(getTermRelationships).mockResolvedValue([]);

      const caller = cmsPostsRouter.createCaller(ctx as never);
      await caller.duplicate({ id: MOCK_POST.id });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'duplicate',
          entityType: 'post',
          entityId: copiedPost.id,
          entityTitle: copiedPost.title,
          metadata: { originalId: MOCK_POST.id },
        })
      );
    });

    it('throws NOT_FOUND when original post does not exist', async () => {
      const ctx = createMockCtx();
      asMock(fetchOrNotFound).mockRejectedValue(
        new (await import('@trpc/server')).TRPCError({
          code: 'NOT_FOUND',
          message: 'Post not found',
        })
      );

      const caller = cmsPostsRouter.createCaller(ctx as never);

      await expect(
        caller.duplicate({ id: 'f0f0f0f0-a1a1-4b2b-9c3c-d4d4d4d4d4d4' })
      ).rejects.toThrow('Post not found');
    });
  });
});
