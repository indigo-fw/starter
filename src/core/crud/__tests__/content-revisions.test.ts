import { MAX_REVISIONS, createRevision } from '../content-revisions';
import { inArray } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/server/db/schema', () => ({
  cmsContentRevisions: {
    id: 'rev.id',
    contentType: 'rev.content_type',
    contentId: 'rev.content_id',
    createdAt: 'rev.created_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ type: 'eq', col, val })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  desc: vi.fn((col: unknown) => ({ type: 'desc', col })),
  inArray: vi.fn((col: unknown, values: unknown) => ({
    type: 'inArray',
    col,
    values,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb() {
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockReturnValue({ values: insertValues });

  // select chain terminates in a subquery object (never awaited — it's embedded in the DELETE)
  const subquery = { kind: 'SUBQUERY' };
  const limit = vi.fn().mockReturnValue(subquery);
  const offset = vi.fn().mockReturnValue({ limit });
  const orderBy = vi.fn().mockReturnValue({ offset });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const del = vi.fn().mockReturnValue({ where: deleteWhere });

  return {
    insert,
    select,
    delete: del,
    _: { insertValues, offset, limit, deleteWhere, subquery, orderBy },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createRevision', () => {
  it('inserts the snapshot and prunes rows past MAX_REVISIONS in one DELETE … IN (subquery)', async () => {
    const db = makeDb();
    const snapshot = { title: 'T', slug: 's' };

    await createRevision(db as never, 'blog', 'content-1', snapshot, 'user-1');

    expect(db._.insertValues).toHaveBeenCalledWith({
      contentType: 'blog',
      contentId: 'content-1',
      snapshot,
      createdBy: 'user-1',
    });

    // Surplus = everything after the newest MAX_REVISIONS for this entity
    expect(db._.offset).toHaveBeenCalledWith(MAX_REVISIONS);
    expect(db._.limit).toHaveBeenCalledWith(expect.any(Number));
    expect(inArray).toHaveBeenCalledWith('rev.id', db._.subquery);
    expect(db._.deleteWhere).toHaveBeenCalledWith({
      type: 'inArray',
      col: 'rev.id',
      values: db._.subquery,
    });
    // insert first, prune second — both on the same client (tx-safe)
    expect(db.insert.mock.invocationCallOrder[0]).toBeLessThan(
      db.delete.mock.invocationCallOrder[0]!
    );
  });

  it('orders newest-first with an id tiebreak so the prune is deterministic', async () => {
    const { desc } = await import('drizzle-orm');
    const db = makeDb();

    await createRevision(db as never, 'blog', 'content-1', {}, undefined);

    expect(desc).toHaveBeenCalledWith('rev.created_at');
    expect(desc).toHaveBeenCalledWith('rev.id');
    expect(db._.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: null })
    );
  });

  it('keeps MAX_REVISIONS at 50', () => {
    expect(MAX_REVISIONS).toBe(50);
  });
});
