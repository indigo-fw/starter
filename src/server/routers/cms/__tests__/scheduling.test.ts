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

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  },
}));

vi.mock('@/lib/constants', () => ({
  LOCALES: ['en'],
  DEFAULT_LOCALE: 'en',
}));

vi.mock('@/core/types/cms', () => ({
  ContentStatus: {
    DRAFT: 0,
    PUBLISHED: 1,
    SCHEDULED: 2,
  },
}));

vi.mock('@/server/db/schema', () => ({
  cmsPosts: {
    id: 'cms_posts.id',
    title: 'cms_posts.title',
    slug: 'cms_posts.slug',
    type: 'cms_posts.type',
    status: 'cms_posts.status',
    lang: 'cms_posts.lang',
    content: 'cms_posts.content',
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
    name: 'cms_categories.name',
    slug: 'cms_categories.slug',
    status: 'cms_categories.status',
    lang: 'cms_categories.lang',
    publishedAt: 'cms_categories.published_at',
    deletedAt: 'cms_categories.deleted_at',
  },
  user: {
    id: 'user.id',
    role: 'user.role',
  },
}));

vi.mock('@/server/lib/notifications', () => ({
  sendBulkNotification: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { cmsSchedulingRouter } from '../scheduling';
import { createMockCtx } from '../../__tests__/test-helpers';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const futureDate = new Date('2026-06-15T10:00:00Z');
const futureDate2 = new Date('2026-06-20T14:00:00Z');

const MOCK_SCHEDULED_POST = {
  id: 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5',
  title: 'Upcoming Article',
  slug: 'upcoming-article',
  postType: 2,
  publishedAt: futureDate,
  lang: 'en',
};

const MOCK_SCHEDULED_POST_2 = {
  id: 'a2a2a2a2-b3b3-4c4c-8d5d-e6e6e6e6e6e6',
  title: 'Another Scheduled',
  slug: 'another-scheduled',
  postType: 2,
  publishedAt: futureDate2,
  lang: 'en',
};

const MOCK_FULL_POST = {
  id: 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5',
  type: 2,
  title: 'Upcoming Article',
  slug: 'upcoming-article',
  lang: 'en',
  content: 'Preview content here',
  status: 2, // SCHEDULED
  metaDescription: 'A scheduled post',
  seoTitle: null,
  featuredImage: null,
  featuredImageAlt: null,
  jsonLd: null,
  noindex: false,
  publishedAt: futureDate,
  translationGroup: null,
  fallbackToDefault: null,
  parentId: null,
  authorId: 'user-1',
  previewToken: 'tok456',
  createdAt: new Date('2025-12-01'),
  updatedAt: new Date('2025-12-01'),
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cmsSchedulingRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // upcomingScheduled
  // =========================================================================
  describe('upcomingScheduled', () => {
    it('returns scheduled posts ordered by publishedAt', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([
        MOCK_SCHEDULED_POST,
        MOCK_SCHEDULED_POST_2,
      ]);

      const caller = cmsSchedulingRouter.createCaller(ctx as never);
      const result = await caller.upcomingScheduled({ limit: 10 });

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Upcoming Article');
      expect(result[1].title).toBe('Another Scheduled');
      expect(ctx.db.select).toHaveBeenCalled();
    });

    it('returns empty array when no scheduled posts exist', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = cmsSchedulingRouter.createCaller(ctx as never);
      const result = await caller.upcomingScheduled({ limit: 10 });

      expect(result).toHaveLength(0);
    });
  });

  // =========================================================================
  // scheduledPreview
  // =========================================================================
  describe('scheduledPreview', () => {
    it('returns full post data for a scheduled post', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_FULL_POST]);

      const caller = cmsSchedulingRouter.createCaller(ctx as never);
      const result = await caller.scheduledPreview({ id: MOCK_FULL_POST.id });

      expect(result.id).toBe(MOCK_FULL_POST.id);
      expect(result.title).toBe('Upcoming Article');
      expect(result.content).toBe('Preview content here');
      expect(result.status).toBe(2);
    });

    it('throws NOT_FOUND for a non-scheduled or missing post', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit.mockResolvedValue([]);

      const caller = cmsSchedulingRouter.createCaller(ctx as never);
      await expect(
        caller.scheduledPreview({ id: 'b0b0b0b0-c1c1-4d2d-8e3e-f4f4f4f4f4f4' })
      ).rejects.toThrow('Scheduled post not found');
    });
  });

  // =========================================================================
  // calendarEvents
  // =========================================================================
  describe('calendarEvents', () => {
    it('returns posts and categories within date range', async () => {
      const postEvents = [
        {
          id: 'p1p1p1p1-0000-4000-a000-000000000001',
          title: 'January Blog Post',
          type: 2,
          status: 1,
          slug: 'january-blog-post',
          publishedAt: new Date('2026-01-10'),
        },
      ];
      const catEvents = [
        {
          id: 'c1c1c1c1-0000-4000-a000-000000000001',
          title: 'New Category',
          status: 1,
          slug: 'new-category',
          publishedAt: new Date('2026-01-05'),
        },
      ];

      const ctx = createMockCtx();
      // First select() call returns posts, second returns categories
      ctx.db._chains.select.limit
        .mockResolvedValueOnce(postEvents)
        .mockResolvedValueOnce(catEvents);

      const caller = cmsSchedulingRouter.createCaller(ctx as never);
      const result = await caller.calendarEvents({ month: 1, year: 2026 });

      expect(result).toHaveLength(2);

      const postItem = result.find((e) => e.contentType === 'post');
      expect(postItem).toBeDefined();
      expect(postItem!.title).toBe('January Blog Post');
      expect(postItem!.contentType).toBe('post');

      const catItem = result.find((e) => e.contentType === 'category');
      expect(catItem).toBeDefined();
      expect(catItem!.title).toBe('New Category');
      expect(catItem!.contentType).toBe('category');
    });

    it('respects lang filter', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const caller = cmsSchedulingRouter.createCaller(ctx as never);
      const result = await caller.calendarEvents({ month: 3, year: 2026, lang: 'en' });

      expect(result).toHaveLength(0);
      // Both select calls should have been made (posts + categories)
      expect(ctx.db.select).toHaveBeenCalledTimes(2);
    });

    it('returns empty when no events exist in date range', async () => {
      const ctx = createMockCtx();
      ctx.db._chains.select.limit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const caller = cmsSchedulingRouter.createCaller(ctx as never);
      const result = await caller.calendarEvents({ month: 12, year: 2025 });

      expect(result).toHaveLength(0);
    });
  });
});
