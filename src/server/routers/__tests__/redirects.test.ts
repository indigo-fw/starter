import { redirectsRouter } from '../redirects';
import { createMockCtx } from './test-helpers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveRedirectTargets } from '@/core/crud/slug-redirects';
import { asMock } from '@/test-utils';

// ---------------------------------------------------------------------------
// Mock ALL external dependencies BEFORE imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn().mockResolvedValue(null) } },
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

vi.mock('@/core/crud/slug-redirects', () => ({
  resolveCurrentSlug: vi.fn().mockResolvedValue(null),
  resolveRedirectTargets: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('@/core/lib/infra/audit', () => ({ logAudit: vi.fn() }));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROWS = [
  {
    id: 'r1',
    oldSlug: 'old-post',
    contentType: 'blog',
    contentId: 'p1',
    urlPrefix: '/blog/',
  },
  {
    id: 'r2',
    oldSlug: 'old-work',
    contentType: 'portfolio',
    contentId: 'w1',
    urlPrefix: '/portfolio/',
  },
  {
    id: 'r3',
    oldSlug: 'old-show',
    contentType: 'showcase',
    contentId: 's1',
    urlPrefix: '/showcase/',
  },
  {
    id: 'r4',
    oldSlug: 'old-show-2',
    contentType: 'showcase',
    contentId: 's2',
    urlPrefix: '/showcase/',
  },
];

/**
 * `list` runs two selects: the page (`…orderBy().limit().offset()`) and the
 * count (`…where()` awaited directly). The shared helper's chain doesn't cover
 * `.limit().offset()`, so build the db inline.
 */
function createListDb(rows: typeof ROWS, total: number) {
  const offset = vi.fn().mockResolvedValue(rows);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  let call = 0;
  const where = vi.fn().mockImplementation(() => {
    call += 1;
    // First select is the page query, second the count.
    return call === 1 ? { orderBy } : Promise.resolve([{ count: total }]);
  });
  const from = vi.fn().mockReturnValue({ where });
  return { select: vi.fn().mockReturnValue({ from }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  asMock(resolveRedirectTargets).mockResolvedValue(new Map());
});

describe('redirects.list target enrichment', () => {
  it('resolves titles per contentType through the registry, including portfolio/showcase', async () => {
    asMock(resolveRedirectTargets).mockImplementation(
      async (_db: unknown, contentType: string, ids: string[]) => {
        const out = new Map<string, { slug: string; title: string }>();
        for (const id of ids) {
          if (id === 's2') continue; // hard-deleted target
          out.set(id, {
            slug: `${contentType}-${id}`,
            title: `${contentType.toUpperCase()} ${id}`,
          });
        }
        return out;
      }
    );

    const ctx = createMockCtx({ db: createListDb(ROWS, ROWS.length) });
    const caller = redirectsRouter.createCaller(ctx as never);
    const result = await caller.list({ page: 1, pageSize: 20 });

    // One batched call per contentType, never one per row.
    expect(resolveRedirectTargets).toHaveBeenCalledTimes(3);
    expect(resolveRedirectTargets).toHaveBeenCalledWith(ctx.db, 'blog', ['p1']);
    expect(resolveRedirectTargets).toHaveBeenCalledWith(ctx.db, 'portfolio', [
      'w1',
    ]);
    expect(resolveRedirectTargets).toHaveBeenCalledWith(ctx.db, 'showcase', [
      's1',
      's2',
    ]);

    expect(
      result.results.map((r) => [r.id, r.targetTitle, r.targetSlug])
    ).toEqual([
      ['r1', 'BLOG p1', 'blog-p1'],
      ['r2', 'PORTFOLIO w1', 'portfolio-w1'],
      ['r3', 'SHOWCASE s1', 'showcase-s1'],
      ['r4', '(deleted)', ''],
    ]);
    expect(result.total).toBe(4);
  });

  it('marks rows of a type with no registered resolver as "(deleted)"', async () => {
    const ctx = createMockCtx({ db: createListDb([ROWS[1]], 1) });
    const caller = redirectsRouter.createCaller(ctx as never);
    const result = await caller.list();

    expect(result.results[0]).toMatchObject({
      targetTitle: '(deleted)',
      targetSlug: '',
    });
  });

  it('does not call the resolver for an empty page', async () => {
    const ctx = createMockCtx({ db: createListDb([], 0) });
    const caller = redirectsRouter.createCaller(ctx as never);
    const result = await caller.list();

    expect(result.results).toEqual([]);
    expect(resolveRedirectTargets).not.toHaveBeenCalled();
  });
});
