import { createSlugRestoreCheck, softRestore } from '../admin-crud';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/core/crud/drizzle-utils', () => ({
  getAffectedRows: vi.fn().mockReturnValue(1),
  wordSplitLike: vi.fn(),
}));

vi.mock('@/server/db/schema', () => ({
  cmsContentRevisions: {},
  cmsSlugRedirects: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ type: 'eq', col, val })),
  ne: vi.fn((col: unknown, val: unknown) => ({ type: 'ne', col, val })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNull: vi.fn((col: unknown) => ({ type: 'isNull', col })),
  isNotNull: vi.fn((col: unknown) => ({ type: 'isNotNull', col })),
  asc: vi.fn(),
  desc: vi.fn(),
  count: vi.fn(),
  sql: Object.assign(vi.fn(), { join: vi.fn(), identifier: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const col = (name: string) => ({ name }) as never;

const POSTS = {
  table: 'POSTS' as never,
  idCol: col('id'),
  slugCol: col('slug'),
  langCol: col('lang'),
  deletedAtCol: col('deleted_at'),
  scopeCols: [col('type')],
};

/** db whose select().from().where().limit() answers from a queue, call by call. */
function makeDb(...answers: unknown[][]) {
  const limit = vi.fn();
  for (const a of answers) limit.mockResolvedValueOnce(a);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return {
    select,
    execute: vi.fn().mockResolvedValue({ count: 1 }),
    _select: select,
    _where: where,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSlugRestoreCheck', () => {
  it('throws CONFLICT when a live row already uses the trashed slug in the same lang + scope', async () => {
    const db = makeDb(
      [{ slug: 'hello', lang: 'en', type: 2 }], // the trashed row
      [{ id: 'live-row' }] // ensureSlugUnique finds a collision
    );
    const check = createSlugRestoreCheck(POSTS, 'post');

    const err = await check(db as never, 'trashed-id').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('CONFLICT');
    expect((err as TRPCError).message).toMatch(/Cannot restore.*"hello"/);
  });

  it('scopes the uniqueness lookup by lang and the extra scope columns from the trashed row', async () => {
    const { eq, isNull } = await import('drizzle-orm');
    const db = makeDb([{ slug: 'hello', lang: 'de', type: 1 }], []);
    const check = createSlugRestoreCheck(POSTS, 'post');

    await check(db as never, 'trashed-id');

    // Second select is the uniqueness probe — its predicate must carry every scope.
    expect(eq).toHaveBeenCalledWith(POSTS.slugCol, 'hello');
    expect(eq).toHaveBeenCalledWith(POSTS.langCol, 'de');
    expect(eq).toHaveBeenCalledWith(POSTS.scopeCols[0], 1);
    expect(isNull).toHaveBeenCalledWith(POSTS.deletedAtCol);
    expect(db._select).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when the trashed row does not exist (softRestore reports NOT_FOUND)', async () => {
    const db = makeDb([]);
    const check = createSlugRestoreCheck(POSTS, 'post');

    await expect(check(db as never, 'missing')).resolves.toBeUndefined();
    expect(db._select).toHaveBeenCalledTimes(1);
  });

  it('blocks softRestore before the UPDATE runs', async () => {
    const db = makeDb(
      [{ slug: 'hello', lang: 'en', type: 2 }],
      [{ id: 'live-row' }]
    );
    const cols = {
      table: 'POSTS' as never,
      id: col('id'),
      deleted_at: col('deleted_at'),
    };

    await expect(
      softRestore(
        db as never,
        cols,
        'trashed-id',
        createSlugRestoreCheck(POSTS, 'post')
      )
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(db.execute).not.toHaveBeenCalled();
  });
});
