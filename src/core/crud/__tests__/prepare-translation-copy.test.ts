import {
  ensureUniqueInTranslationGroup,
  prepareTranslationCopy,
} from '../admin-crud';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/core/crud/drizzle-utils', () => ({
  getAffectedRows: vi.fn(),
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
  isNotNull: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  count: vi.fn(),
  sql: Object.assign(vi.fn(), { join: vi.fn(), identifier: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COLS = {
  id: 'posts.id' as never,
  slug: 'posts.slug' as never,
  lang: 'posts.lang' as never,
  deletedAt: 'posts.deleted_at' as never,
  // prepareTranslationCopy keys the group update by `col.name`, so this one needs a name
  translationGroup: { name: 'translation_group' } as never,
};
const TABLE = 'POSTS' as never;

/** db whose select().from().where().limit() answers from a queue, call by call. */
function makeDb(...answers: unknown[][]) {
  const limit = vi.fn();
  for (const a of answers) limit.mockResolvedValueOnce(a);
  limit.mockResolvedValue([]);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockReturnValue({ set });

  return { select, update, _: { select, set } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ensureUniqueInTranslationGroup', () => {
  it('throws CONFLICT when a live row already holds the lang in the group', async () => {
    const db = makeDb([{ id: 'existing-de' }]);

    const err = await ensureUniqueInTranslationGroup(
      db as never,
      { table: TABLE, ...COLS },
      'group-1',
      'de'
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('CONFLICT');
    expect((err as TRPCError).message).toMatch(/"de" already exists/);
  });

  it('ignores soft-deleted siblings and the excluded id', async () => {
    const { eq, ne, isNull } = await import('drizzle-orm');
    const db = makeDb([]);

    await ensureUniqueInTranslationGroup(
      db as never,
      { table: TABLE, ...COLS },
      'group-1',
      'de',
      'self-id'
    );

    expect(eq).toHaveBeenCalledWith(COLS.translationGroup, 'group-1');
    expect(eq).toHaveBeenCalledWith(COLS.lang, 'de');
    expect(isNull).toHaveBeenCalledWith(COLS.deletedAt);
    expect(ne).toHaveBeenCalledWith(COLS.id, 'self-id');
  });
});

describe('prepareTranslationCopy', () => {
  it('rejects a second translation for the same group + lang before any write', async () => {
    const db = makeDb([{ id: 'existing-de' }]);

    await expect(
      prepareTranslationCopy(
        db as never,
        TABLE,
        COLS,
        'source-id',
        'hello',
        'group-1',
        'de'
      )
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(db.update).not.toHaveBeenCalled();
  });

  it('proceeds when the group has no row in the target lang', async () => {
    const db = makeDb(
      [], // group + lang probe
      [] // slug probe
    );

    const result = await prepareTranslationCopy(
      db as never,
      TABLE,
      COLS,
      'source-id',
      'hello',
      'group-1',
      'de'
    );

    expect(result.translationGroup).toBe('group-1');
    expect(result.slug).toBe('hello-de');
    expect(result.previewToken).toHaveLength(64);
    expect(db.update).not.toHaveBeenCalled(); // source already had a group
  });

  it('numbers a taken target slug instead of appending a timestamp', async () => {
    const db = makeDb(
      [], // group + lang probe
      [{ id: 'taken' }], // hello-de taken
      [] // hello-de-2 free
    );

    const result = await prepareTranslationCopy(
      db as never,
      TABLE,
      COLS,
      'source-id',
      'hello',
      'group-1',
      'de'
    );

    expect(result.slug).toBe('hello-de-2');
  });

  it('skips the group check for a source without a group and assigns one', async () => {
    const db = makeDb([]); // only the slug probe runs

    const result = await prepareTranslationCopy(
      db as never,
      TABLE,
      COLS,
      'source-id',
      'hello',
      null,
      'de'
    );

    expect(db._.select).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db._.set).toHaveBeenCalledWith({
      translation_group: result.translationGroup,
    });
  });
});
