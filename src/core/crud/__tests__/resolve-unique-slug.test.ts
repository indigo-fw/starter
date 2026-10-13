import {
  generateCopySlug,
  insertOrConflict,
  resolveUniqueSlug,
} from '../admin-crud';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/core/crud/drizzle-utils', async () => {
  // Real duplicate-key detection — that mapping is what insertOrConflict is for
  const actual =
    await vi.importActual<typeof import('../drizzle-utils')>(
      '../drizzle-utils'
    );
  return {
    getAffectedRows: vi.fn(),
    wordSplitLike: vi.fn(),
    isDuplicateKeyError: actual.isDuplicateKeyError,
  };
});

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
  getTableName: vi.fn((table: { _name: string }) => table._name),
  sql: Object.assign(vi.fn(), { join: vi.fn(), identifier: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TABLE = { _name: 'cms_posts' } as never;
const COLS = {
  table: TABLE,
  slug: 'posts.slug' as never,
  id: 'posts.id' as never,
  lang: 'posts.lang' as never,
  deletedAt: 'posts.deleted_at' as never,
};

/** db whose slug probes answer from `taken`: a candidate is taken while it is in the set. */
function makeDb(taken: Set<string>) {
  const probed: string[] = [];
  const limit = vi.fn().mockImplementation(() => {
    const candidate = probed[probed.length - 1]!;
    return Promise.resolve(taken.has(candidate) ? [{ id: 'x' }] : []);
  });
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  // The slug predicate is built right before each probe — record the candidate there
  vi.mocked(eq).mockImplementation((col: unknown, val: unknown) => {
    if (col === COLS.slug) probed.push(String(val));
    return { type: 'eq', col, val } as never;
  });

  return { select, probed };
}

/** A DrizzleQueryError-shaped failure: the driver error sits on `cause`. */
function duplicateKeyError(constraint: string): Error {
  const driver = Object.assign(new Error('duplicate key value'), {
    code: '23505',
    constraint_name: constraint,
  });
  return Object.assign(new Error('Failed query: insert into …'), {
    cause: driver,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// resolveUniqueSlug
// ---------------------------------------------------------------------------

describe('resolveUniqueSlug', () => {
  it('slugifies the base and returns it when free', async () => {
    const db = makeDb(new Set());
    await expect(
      resolveUniqueSlug(db as never, COLS, 'Hello World!', { lang: 'en' })
    ).resolves.toBe('hello-world');
    expect(db.probed).toEqual(['hello-world']);
  });

  it('walks -2, -3 … until a free numbered variant', async () => {
    const db = makeDb(new Set(['hello', 'hello-2', 'hello-3']));
    await expect(resolveUniqueSlug(db as never, COLS, 'hello')).resolves.toBe(
      'hello-4'
    );
    expect(db.probed).toEqual(['hello', 'hello-2', 'hello-3', 'hello-4']);
  });

  it('falls back to a short random suffix after the numbered attempts', async () => {
    const taken = new Set(['hello']);
    for (let n = 2; n <= 20; n++) taken.add(`hello-${n}`);
    const db = makeDb(taken);

    const slug = await resolveUniqueSlug(db as never, COLS, 'hello');
    expect(slug).toMatch(/^hello-[0-9a-f]{6}$/);
    expect(db.probed).toHaveLength(21);
  });

  it('gives up with CONFLICT when even random suffixes collide', async () => {
    // Every probe answers "taken"
    const db = makeDb({ has: () => true } as never);
    await expect(
      resolveUniqueSlug(db as never, COLS, 'hello')
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(db.probed).toHaveLength(23);
  });

  it('uses "untitled" when the base slugifies to nothing', async () => {
    const db = makeDb(new Set());
    await expect(resolveUniqueSlug(db as never, COLS, '???')).resolves.toBe(
      'untitled'
    );
  });

  it('scopes the probe by lang, soft-delete, extra conditions and excludeId', async () => {
    const db = makeDb(new Set());
    const extra = { type: 'eq', col: 'posts.type', val: 2 };

    await resolveUniqueSlug(
      db as never,
      COLS,
      'hello',
      { lang: 'de', extraConditions: [extra as never] },
      'self-id'
    );

    expect(eq).toHaveBeenCalledWith(COLS.lang, 'de');
    expect(ne).toHaveBeenCalledWith(COLS.id, 'self-id');
    expect(isNull).toHaveBeenCalledWith(COLS.deletedAt);
    expect(vi.mocked(and).mock.calls[0]).toEqual(
      expect.arrayContaining([extra])
    );
  });
});

// ---------------------------------------------------------------------------
// generateCopySlug — now a thin wrapper
// ---------------------------------------------------------------------------

describe('generateCopySlug', () => {
  it('keeps the historical -copy, -copy-2 sequence', async () => {
    const db = makeDb(new Set(['my-post-copy']));
    await expect(
      generateCopySlug(
        db as never,
        TABLE,
        COLS.slug,
        COLS.deletedAt,
        'my-post',
        COLS.lang,
        'en'
      )
    ).resolves.toBe('my-post-copy-2');
  });

  it('no longer fails after 20 copies — random suffix instead of CONFLICT', async () => {
    const taken = new Set(['my-post-copy']);
    for (let n = 2; n <= 20; n++) taken.add(`my-post-copy-${n}`);
    const db = makeDb(taken);
    await expect(
      generateCopySlug(db as never, TABLE, COLS.slug, COLS.deletedAt, 'my-post')
    ).resolves.toMatch(/^my-post-copy-[0-9a-f]{6}$/);
  });
});

// ---------------------------------------------------------------------------
// insertOrConflict
// ---------------------------------------------------------------------------

describe('insertOrConflict', () => {
  it('returns the insert result untouched', async () => {
    await expect(
      insertOrConflict(TABLE, 'de', async () => [{ id: 'new' }])
    ).resolves.toEqual([{ id: 'new' }]);
  });

  it('maps the <table>_group_lang_uniq violation to a translation CONFLICT', async () => {
    const err = await insertOrConflict(TABLE, 'de', async () => {
      throw duplicateKeyError('cms_posts_group_lang_uniq');
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('CONFLICT');
    expect((err as TRPCError).message).toBe(
      'A de translation already exists in this group'
    );
    expect((err as TRPCError).cause).toBeInstanceOf(Error);
  });

  it('maps any other unique violation to a generic CONFLICT', async () => {
    const err = await insertOrConflict(TABLE, 'de', async () => {
      throw duplicateKeyError('cms_posts_type_lang_slug_uniq');
    }).catch((e: unknown) => e);

    expect((err as TRPCError).code).toBe('CONFLICT');
    expect((err as TRPCError).message).toMatch(/slug already exists/);
  });

  it('rethrows non-duplicate errors unchanged', async () => {
    const boom = new Error('connection reset');
    await expect(
      insertOrConflict(TABLE, 'de', async () => {
        throw boom;
      })
    ).rejects.toBe(boom);
  });
});
