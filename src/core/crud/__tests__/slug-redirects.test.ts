import {
  createTableSlugResolver,
  registerSlugResolver,
  resolveCurrentSlug,
  resolveSlugRedirect,
} from '../slug-redirects';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be before imports
// ---------------------------------------------------------------------------

const {
  mockSlugRedirectsFindFirst,
  mockSelectLimit,
  mockSelectWhere,
  mockSelectFrom,
  mockSelect,
  mockDb,
} = vi.hoisted(() => {
  const mockSlugRedirectsFindFirst = vi.fn();
  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
  const mockDb = {
    query: {
      cmsSlugRedirects: {
        findFirst: (...args: unknown[]) => mockSlugRedirectsFindFirst(...args),
      },
    },
    select: (...args: unknown[]) => mockSelect(...args),
  };
  return {
    mockSlugRedirectsFindFirst,
    mockSelectLimit,
    mockSelectWhere,
    mockSelectFrom,
    mockSelect,
    mockDb,
  };
});

vi.mock('@/server/db', () => ({ db: mockDb }));

vi.mock('@/server/db/schema', () => ({
  cmsSlugRedirects: {
    oldSlug: 'old_slug',
    urlPrefix: 'url_prefix',
    createdAt: 'created_at',
    contentType: 'content_type',
    contentId: 'content_id',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNull: vi.fn((col: unknown) => ({ type: 'isNull', col })),
  desc: vi.fn((col: unknown) => ({ type: 'desc', col })),
}));

// ---------------------------------------------------------------------------
// Fixtures — stand-ins for the tables routers register at load time
// ---------------------------------------------------------------------------

const PORTFOLIO_TABLE = {
  table: 'PORTFOLIO_TABLE' as never,
  id: 'portfolio.id' as never,
  slug: 'portfolio.slug' as never,
  deletedAt: 'portfolio.deleted_at' as never,
};

const POSTS_TABLE = {
  table: 'POSTS_TABLE' as never,
  id: 'posts.id' as never,
  slug: 'posts.slug' as never,
  deletedAt: 'posts.deleted_at' as never,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockSelect.mockReturnValue({ from: mockSelectFrom });
  mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
  registerSlugResolver('portfolio', createTableSlugResolver(PORTFOLIO_TABLE));
  registerSlugResolver('blog', createTableSlugResolver(POSTS_TABLE));
});

describe('resolveSlugRedirect', () => {
  it('resolves a portfolio redirect through the registered resolver (not cmsPosts)', async () => {
    mockSlugRedirectsFindFirst.mockResolvedValue({
      contentType: 'portfolio',
      contentId: 'portfolio-uuid-1',
    });
    mockSelectLimit.mockResolvedValue([{ slug: 'new-project-slug' }]);

    const result = await resolveSlugRedirect('old-project-slug', '/portfolio/');

    expect(result).toBe('/portfolio/new-project-slug');
    expect(mockSelectFrom).toHaveBeenCalledWith('PORTFOLIO_TABLE');
    expect(mockSelectFrom).not.toHaveBeenCalledWith('POSTS_TABLE');
  });

  it('resolves a post-backed redirect through its registered table', async () => {
    mockSlugRedirectsFindFirst.mockResolvedValue({
      contentType: 'blog',
      contentId: 'post-uuid-1',
    });
    mockSelectLimit.mockResolvedValue([{ slug: 'new-post-slug' }]);

    const result = await resolveSlugRedirect('old-post-slug', '/blog/');

    expect(result).toBe('/blog/new-post-slug');
    expect(mockSelectFrom).toHaveBeenCalledWith('POSTS_TABLE');
  });

  it('returns null when no redirect is found', async () => {
    mockSlugRedirectsFindFirst.mockResolvedValue(undefined);

    const result = await resolveSlugRedirect('nonexistent-slug', '/blog/');

    expect(result).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns null for a contentType with no registered resolver', async () => {
    mockSlugRedirectsFindFirst.mockResolvedValue({
      contentType: 'widget',
      contentId: 'widget-uuid-1',
    });

    const result = await resolveSlugRedirect('old-widget', '/widget/');

    expect(result).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns null when the target has been deleted', async () => {
    mockSlugRedirectsFindFirst.mockResolvedValue({
      contentType: 'portfolio',
      contentId: 'portfolio-uuid-deleted',
    });
    mockSelectLimit.mockResolvedValue([]);

    const result = await resolveSlugRedirect('old-slug', '/portfolio/');

    expect(result).toBeNull();
  });

  it('returns null when the current slug matches the old slug (no-op redirect)', async () => {
    mockSlugRedirectsFindFirst.mockResolvedValue({
      contentType: 'blog',
      contentId: 'post-uuid-1',
    });
    mockSelectLimit.mockResolvedValue([{ slug: 'same-slug' }]);

    const result = await resolveSlugRedirect('same-slug', '/blog/');

    expect(result).toBeNull();
  });
});

describe('resolveCurrentSlug', () => {
  it('uses the db handed in, so admin chain detection runs on ctx.db', async () => {
    const limit = vi.fn().mockResolvedValue([{ slug: 'current' }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const otherDb = { select: vi.fn().mockReturnValue({ from }) };

    const slug = await resolveCurrentSlug(
      otherDb as never,
      'portfolio',
      'portfolio-uuid-1'
    );

    expect(slug).toBe('current');
    expect(otherDb.select).toHaveBeenCalledTimes(1);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('returns null for an unregistered type without touching the db', async () => {
    const slug = await resolveCurrentSlug(mockDb as never, 'nope', 'id');

    expect(slug).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
