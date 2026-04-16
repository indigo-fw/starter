import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be before imports
// ---------------------------------------------------------------------------

const mockSlugRedirectsFindFirst = vi.fn();
const mockCategoriesFindFirst = vi.fn();
const mockPostsFindFirst = vi.fn();

vi.mock('@/server/db', () => ({
  db: {
    query: {
      cmsSlugRedirects: { findFirst: (...args: unknown[]) => mockSlugRedirectsFindFirst(...args) },
      cmsCategories: { findFirst: (...args: unknown[]) => mockCategoriesFindFirst(...args) },
      cmsPosts: { findFirst: (...args: unknown[]) => mockPostsFindFirst(...args) },
    },
  },
}));

vi.mock('@/server/db/schema', () => ({
  cmsSlugRedirects: {
    oldSlug: 'old_slug',
    urlPrefix: 'url_prefix',
    createdAt: 'created_at',
    contentType: 'content_type',
    contentId: 'content_id',
  },
  cmsCategories: {
    id: 'id',
    slug: 'slug',
    deletedAt: 'deleted_at',
  },
  cmsPosts: {
    id: 'id',
    slug: 'slug',
    deletedAt: 'deleted_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNull: vi.fn((col: unknown) => ({ type: 'isNull', col })),
  desc: vi.fn((col: unknown) => ({ type: 'desc', col })),
}));

import { resolveSlugRedirect } from '../slug-redirects';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveSlugRedirect', () => {
  it('returns full path when a redirect exists for a post', async () => {
    mockSlugRedirectsFindFirst.mockResolvedValue({
      contentType: 'post',
      contentId: 'post-uuid-1',
    });
    mockPostsFindFirst.mockResolvedValue({ slug: 'new-post-slug' });

    const result = await resolveSlugRedirect('old-post-slug', '/blog/');

    expect(result).toBe('/blog/new-post-slug');
    expect(mockSlugRedirectsFindFirst).toHaveBeenCalledTimes(1);
    expect(mockPostsFindFirst).toHaveBeenCalledTimes(1);
    expect(mockCategoriesFindFirst).not.toHaveBeenCalled();
  });

  it('returns full path when a redirect exists for a category', async () => {
    mockSlugRedirectsFindFirst.mockResolvedValue({
      contentType: 'category',
      contentId: 'cat-uuid-1',
    });
    mockCategoriesFindFirst.mockResolvedValue({ slug: 'new-cat-slug' });

    const result = await resolveSlugRedirect('old-cat-slug', '/category/');

    expect(result).toBe('/category/new-cat-slug');
    expect(mockCategoriesFindFirst).toHaveBeenCalledTimes(1);
    expect(mockPostsFindFirst).not.toHaveBeenCalled();
  });

  it('returns null when no redirect is found', async () => {
    mockSlugRedirectsFindFirst.mockResolvedValue(undefined);

    const result = await resolveSlugRedirect('nonexistent-slug', '/blog/');

    expect(result).toBeNull();
    expect(mockSlugRedirectsFindFirst).toHaveBeenCalledTimes(1);
    expect(mockPostsFindFirst).not.toHaveBeenCalled();
    expect(mockCategoriesFindFirst).not.toHaveBeenCalled();
  });

  it('returns null when the content has been deleted (post)', async () => {
    mockSlugRedirectsFindFirst.mockResolvedValue({
      contentType: 'post',
      contentId: 'post-uuid-deleted',
    });
    mockPostsFindFirst.mockResolvedValue(undefined);

    const result = await resolveSlugRedirect('old-slug', '/blog/');

    expect(result).toBeNull();
  });

  it('returns null when the content has been deleted (category)', async () => {
    mockSlugRedirectsFindFirst.mockResolvedValue({
      contentType: 'category',
      contentId: 'cat-uuid-deleted',
    });
    mockCategoriesFindFirst.mockResolvedValue(undefined);

    const result = await resolveSlugRedirect('old-slug', '/category/');

    expect(result).toBeNull();
  });

  it('returns null when the current slug matches the old slug (no-op redirect)', async () => {
    mockSlugRedirectsFindFirst.mockResolvedValue({
      contentType: 'post',
      contentId: 'post-uuid-1',
    });
    // The content was renamed back to the old slug
    mockPostsFindFirst.mockResolvedValue({ slug: 'same-slug' });

    const result = await resolveSlugRedirect('same-slug', '/blog/');

    expect(result).toBeNull();
  });
});
