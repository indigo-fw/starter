import {
  createTableSlugResolver,
  createTableTargetResolver,
  registerSlugResolver,
  resolveRedirectTargets,
} from '../slug-redirects';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be before imports
// ---------------------------------------------------------------------------

const { mockSelectLimit, mockSelectWhere, mockSelectFrom, mockSelect, mockDb } =
  vi.hoisted(() => {
    const mockSelectLimit = vi.fn();
    const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
    const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
    const mockDb = { select: (...args: unknown[]) => mockSelect(...args) };
    return {
      mockSelectLimit,
      mockSelectWhere,
      mockSelectFrom,
      mockSelect,
      mockDb,
    };
  });

vi.mock('@/server/db', () => ({ db: mockDb }));
vi.mock('@/server/db/schema', () => ({ cmsSlugRedirects: {} }));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNull: vi.fn((col: unknown) => ({ type: 'isNull', col })),
  desc: vi.fn((col: unknown) => ({ type: 'desc', col })),
  inArray: vi.fn((col: unknown, values: unknown) => ({
    type: 'inArray',
    col,
    values,
  })),
}));

const SHOWCASE = {
  table: 'SHOWCASE_TABLE' as never,
  id: 'showcase.id' as never,
  slug: 'showcase.slug' as never,
  title: 'showcase.title' as never,
  deletedAt: 'showcase.deleted_at' as never,
};

const db = mockDb as never;

beforeEach(() => {
  vi.clearAllMocks();
  mockSelect.mockReturnValue({ from: mockSelectFrom });
  mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
});

describe('resolveRedirectTargets', () => {
  it('returns an empty map for a type without a target resolver, without querying', async () => {
    registerSlugResolver('slug-only', createTableSlugResolver(SHOWCASE));
    const result = await resolveRedirectTargets(db, 'slug-only', ['a']);
    expect(result.size).toBe(0);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('batch-resolves slug + title through the registered table in one query', async () => {
    registerSlugResolver(
      'showcase',
      createTableSlugResolver(SHOWCASE),
      createTableTargetResolver(SHOWCASE)
    );
    mockSelectLimit.mockResolvedValue([
      { id: 's1', slug: 'first', title: 'First showcase' },
      { id: 's2', slug: 'second', title: 'Second showcase' },
    ]);

    const result = await resolveRedirectTargets(db, 'showcase', [
      's1',
      's2',
      'gone',
    ]);

    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockSelectFrom).toHaveBeenCalledWith('SHOWCASE_TABLE');
    expect(mockSelectWhere).toHaveBeenCalledWith({
      type: 'inArray',
      col: 'showcase.id',
      values: ['s1', 's2', 'gone'],
    });
    expect(mockSelectLimit).toHaveBeenCalledWith(3);
    expect(result.get('s1')).toEqual({
      slug: 'first',
      title: 'First showcase',
    });
    expect(result.get('s2')).toEqual({
      slug: 'second',
      title: 'Second showcase',
    });
    // Hard-deleted targets are simply absent so the caller can render "(deleted)".
    expect(result.has('gone')).toBe(false);
  });

  it('skips the query entirely for an empty id list', async () => {
    registerSlugResolver(
      'showcase',
      createTableSlugResolver(SHOWCASE),
      createTableTargetResolver(SHOWCASE)
    );
    const result = await resolveRedirectTargets(db, 'showcase', []);
    expect(result.size).toBe(0);
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
