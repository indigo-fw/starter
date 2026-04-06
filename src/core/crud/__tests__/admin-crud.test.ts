import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/core/crud/drizzle-utils', () => ({
  getAffectedRows: vi.fn(),
  wordSplitLike: vi.fn().mockReturnValue('SEARCH_SQL'),
}));

vi.mock('@/server/db/schema', () => ({
  cmsContentRevisions: { contentType: 'contentType', contentId: 'contentId' },
  cmsSlugRedirects: { contentType: 'contentType', contentId: 'contentId' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  ne: vi.fn((...args: unknown[]) => ({ type: 'ne', args })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNull: vi.fn((col: unknown) => ({ type: 'isNull', col })),
  isNotNull: vi.fn((col: unknown) => ({ type: 'isNotNull', col })),
  asc: vi.fn((col: unknown) => ({ type: 'asc', col })),
  desc: vi.fn((col: unknown) => ({ type: 'desc', col })),
  count: vi.fn(() => 'COUNT_FN'),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: 'sql',
      strings,
      values,
      as: vi.fn().mockReturnThis(),
    })),
    {
      join: vi.fn(),
    }
  ),
}));

import { asMock } from '@/core/test-utils';
import {
  parsePagination,
  paginatedResult,
  softDelete,
  softRestore,
  permanentDelete,
  ensureSlugUnique,
  buildStatusCounts,
  buildAdminList,
} from '../admin-crud';
import { getAffectedRows, wordSplitLike } from '@/core/crud/drizzle-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCrudCols() {
  return {
    table: 'TABLE' as never,
    id: 'ID_COL' as never,
    deleted_at: 'DELETED_AT_COL' as never,
  };
}

function makeDb() {
  const executeMock = vi.fn().mockResolvedValue({ rowCount: 1 });

  const selectLimitMock = vi.fn().mockResolvedValue([]);
  const selectWhereMock = vi.fn().mockReturnValue({ limit: selectLimitMock });
  const selectFromMock = vi.fn().mockReturnValue({ where: selectWhereMock });
  const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });

  const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });

  const txDeleteWhereMock = vi.fn().mockResolvedValue(undefined);
  const txDeleteMock = vi.fn().mockReturnValue({ where: txDeleteWhereMock });
  const txExecuteMock = vi.fn().mockResolvedValue(undefined);

  const tx = {
    delete: txDeleteMock,
    execute: txExecuteMock,
    _chains: {
      delete: { where: txDeleteWhereMock },
    },
  };

  const transactionMock = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    await fn(tx);
  });

  return {
    execute: executeMock,
    select: selectMock,
    delete: deleteMock,
    transaction: transactionMock,
    _chains: {
      select: { from: selectFromMock, where: selectWhereMock, limit: selectLimitMock },
      delete: { where: deleteWhereMock },
    },
    _tx: tx,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ======================== parsePagination ========================

describe('parsePagination', () => {
  it('returns defaults when no input given', () => {
    const result = parsePagination();
    expect(result).toEqual({ page: 1, pageSize: 20, offset: 0 });
  });

  it('returns defaults when input is empty object', () => {
    const result = parsePagination({});
    expect(result).toEqual({ page: 1, pageSize: 20, offset: 0 });
  });

  it('respects custom defaultPageSize', () => {
    const result = parsePagination(undefined, 50);
    expect(result).toEqual({ page: 1, pageSize: 50, offset: 0 });
  });

  it('uses provided page and pageSize', () => {
    const result = parsePagination({ page: 3, pageSize: 10 });
    expect(result).toEqual({ page: 3, pageSize: 10, offset: 20 });
  });

  it('calculates offset correctly for page 1', () => {
    const result = parsePagination({ page: 1, pageSize: 25 });
    expect(result.offset).toBe(0);
  });

  it('calculates offset correctly for page 5', () => {
    const result = parsePagination({ page: 5, pageSize: 10 });
    expect(result.offset).toBe(40);
  });

  it('uses default pageSize when only page is provided', () => {
    const result = parsePagination({ page: 2 });
    expect(result).toEqual({ page: 2, pageSize: 20, offset: 20 });
  });
});

// ======================== paginatedResult ========================

describe('paginatedResult', () => {
  it('returns correct shape with items', () => {
    const result = paginatedResult(['a', 'b', 'c'], 30, 1, 10);
    expect(result).toEqual({
      results: ['a', 'b', 'c'],
      total: 30,
      page: 1,
      pageSize: 10,
      totalPages: 3,
    });
  });

  it('rounds totalPages up when not exact division', () => {
    const result = paginatedResult([], 31, 1, 10);
    expect(result.totalPages).toBe(4);
  });

  it('handles exact division', () => {
    const result = paginatedResult([], 20, 1, 10);
    expect(result.totalPages).toBe(2);
  });

  it('handles 0 total items', () => {
    const result = paginatedResult([], 0, 1, 10);
    expect(result.totalPages).toBe(0);
  });

  it('handles 1 total item', () => {
    const result = paginatedResult(['x'], 1, 1, 10);
    expect(result.totalPages).toBe(1);
  });

  it('preserves items array reference', () => {
    const items = [{ id: 1 }, { id: 2 }];
    const result = paginatedResult(items, 2, 1, 10);
    expect(result.results).toBe(items);
  });
});

// ======================== softDelete ========================

describe('softDelete', () => {
  it('executes update and succeeds when row is affected', async () => {
    const db = makeDb();
    asMock(getAffectedRows).mockReturnValue(1);

    await softDelete(db as never, makeCrudCols(), 'record-1');

    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(getAffectedRows).toHaveBeenCalledWith({ rowCount: 1 });
  });

  it('throws NOT_FOUND when 0 rows affected', async () => {
    const db = makeDb();
    asMock(getAffectedRows).mockReturnValue(0);

    await expect(softDelete(db as never, makeCrudCols(), 'missing-id')).rejects.toThrow(
      TRPCError
    );
    await expect(softDelete(db as never, makeCrudCols(), 'missing-id')).rejects.toThrow(
      'Record not found'
    );
  });
});

// ======================== softRestore ========================

describe('softRestore', () => {
  it('executes update and succeeds when row is affected', async () => {
    const db = makeDb();
    asMock(getAffectedRows).mockReturnValue(1);

    await softRestore(db as never, makeCrudCols(), 'record-1');

    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(getAffectedRows).toHaveBeenCalledWith({ rowCount: 1 });
  });

  it('throws NOT_FOUND when 0 rows affected', async () => {
    const db = makeDb();
    asMock(getAffectedRows).mockReturnValue(0);

    await expect(softRestore(db as never, makeCrudCols(), 'missing-id')).rejects.toThrow(
      TRPCError
    );
    await expect(softRestore(db as never, makeCrudCols(), 'missing-id')).rejects.toThrow(
      'Trashed record not found'
    );
  });

  it('calls preRestoreCheck before executing update', async () => {
    const db = makeDb();
    asMock(getAffectedRows).mockReturnValue(1);
    const callOrder: string[] = [];
    const preCheck = vi.fn().mockImplementation(async () => {
      callOrder.push('preCheck');
    });
    db.execute = vi.fn().mockImplementation(async () => {
      callOrder.push('execute');
      return { rowCount: 1 };
    });

    await softRestore(db as never, makeCrudCols(), 'record-1', preCheck);

    expect(preCheck).toHaveBeenCalledWith(db, 'record-1');
    expect(callOrder[0]).toBe('preCheck');
    expect(callOrder[1]).toBe('execute');
  });

  it('propagates preRestoreCheck error without executing update', async () => {
    const db = makeDb();
    const preCheck = vi.fn().mockRejectedValue(
      new TRPCError({ code: 'CONFLICT', message: 'Slug conflict' })
    );

    await expect(
      softRestore(db as never, makeCrudCols(), 'record-1', preCheck)
    ).rejects.toThrow('Slug conflict');

    expect(db.execute).not.toHaveBeenCalled();
  });
});

// ======================== permanentDelete ========================

describe('permanentDelete', () => {
  it('throws NOT_FOUND when record does not exist or is not trashed', async () => {
    const db = makeDb();
    db._chains.select.limit.mockResolvedValue([]);

    await expect(
      permanentDelete(db as never, makeCrudCols(), 'missing-id', 'blog')
    ).rejects.toThrow(TRPCError);
    await expect(
      permanentDelete(db as never, makeCrudCols(), 'missing-id', 'blog')
    ).rejects.toThrow('Trashed record not found');
  });

  it('deletes revisions, redirects, and record in a transaction', async () => {
    const db = makeDb();
    db._chains.select.limit.mockResolvedValue([{ id: 'record-1' }]);

    await permanentDelete(db as never, makeCrudCols(), 'record-1', 'blog');

    expect(db.transaction).toHaveBeenCalledTimes(1);
    // Inside transaction: delete revisions, delete redirects, delete record
    expect(db._tx.delete).toHaveBeenCalledTimes(2);
    expect(db._tx.execute).toHaveBeenCalledTimes(1);
  });

  it('runs cascadeDeletes before deleting revisions', async () => {
    const db = makeDb();
    db._chains.select.limit.mockResolvedValue([{ id: 'record-1' }]);

    const callOrder: string[] = [];
    const cascade = vi.fn().mockImplementation(async () => {
      callOrder.push('cascade');
    });
    db._tx.delete = vi.fn().mockImplementation(() => {
      callOrder.push('delete');
      return { where: vi.fn().mockResolvedValue(undefined) };
    });
    db._tx.execute = vi.fn().mockImplementation(async () => {
      callOrder.push('execute');
    });

    await permanentDelete(db as never, makeCrudCols(), 'record-1', 'blog', cascade);

    expect(cascade).toHaveBeenCalledWith(db._tx, 'record-1');
    expect(callOrder[0]).toBe('cascade');
  });

  it('works without cascadeDeletes', async () => {
    const db = makeDb();
    db._chains.select.limit.mockResolvedValue([{ id: 'record-1' }]);

    await permanentDelete(db as never, makeCrudCols(), 'record-1', 'page');

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db._tx.delete).toHaveBeenCalledTimes(2);
    expect(db._tx.execute).toHaveBeenCalledTimes(1);
  });
});

// ======================== ensureSlugUnique ========================

describe('ensureSlugUnique', () => {
  it('passes when no conflicting record exists', async () => {
    const db = makeDb();
    db._chains.select.limit.mockResolvedValue([]);

    await expect(
      ensureSlugUnique(
        db as never,
        { table: 'TABLE' as never, slugCol: 'SLUG_COL' as never, slug: 'my-slug' },
        'post'
      )
    ).resolves.toBeUndefined();
  });

  it('throws CONFLICT when a record with same slug exists', async () => {
    const db = makeDb();
    db._chains.select.limit.mockResolvedValue([{ id: 'existing-id' }]);

    await expect(
      ensureSlugUnique(
        db as never,
        { table: 'TABLE' as never, slugCol: 'SLUG_COL' as never, slug: 'taken-slug' },
        'post'
      )
    ).rejects.toThrow(TRPCError);

    await expect(
      ensureSlugUnique(
        db as never,
        { table: 'TABLE' as never, slugCol: 'SLUG_COL' as never, slug: 'taken-slug' },
        'post'
      )
    ).rejects.toThrow('A post with slug "taken-slug" already exists');
  });

  it('includes excludeId condition when provided', async () => {
    const db = makeDb();
    db._chains.select.limit.mockResolvedValue([]);

    const { ne } = await import('drizzle-orm');

    await ensureSlugUnique(
      db as never,
      {
        table: 'TABLE' as never,
        slugCol: 'SLUG_COL' as never,
        slug: 'my-slug',
        idCol: 'ID_COL' as never,
        excludeId: 'exclude-this',
      },
      'category'
    );

    expect(ne).toHaveBeenCalledWith('ID_COL', 'exclude-this');
  });

  it('includes lang condition when langCol and lang are provided', async () => {
    const db = makeDb();
    db._chains.select.limit.mockResolvedValue([]);

    const { eq } = await import('drizzle-orm');

    await ensureSlugUnique(
      db as never,
      {
        table: 'TABLE' as never,
        slugCol: 'SLUG_COL' as never,
        slug: 'my-slug',
        langCol: 'LANG_COL' as never,
        lang: 'de',
      },
      'page'
    );

    // eq is called for slugCol match AND langCol match
    expect(eq).toHaveBeenCalledWith('LANG_COL', 'de');
  });

  it('includes deletedAt condition when deletedAtCol is provided', async () => {
    const db = makeDb();
    db._chains.select.limit.mockResolvedValue([]);

    const { isNull } = await import('drizzle-orm');

    await ensureSlugUnique(
      db as never,
      {
        table: 'TABLE' as never,
        slugCol: 'SLUG_COL' as never,
        slug: 'my-slug',
        deletedAtCol: 'DELETED_AT_COL' as never,
      },
      'tag'
    );

    expect(isNull).toHaveBeenCalledWith('DELETED_AT_COL');
  });

  it('includes extraConditions when provided', async () => {
    const db = makeDb();
    db._chains.select.limit.mockResolvedValue([]);

    const { and } = await import('drizzle-orm');

    const extraCond = { type: 'extra' } as never;
    await ensureSlugUnique(
      db as never,
      {
        table: 'TABLE' as never,
        slugCol: 'SLUG_COL' as never,
        slug: 'my-slug',
        extraConditions: [extraCond],
      },
      'post'
    );

    // and() should receive the extra condition among its arguments
    const andArgs = asMock(and).mock.calls[0]!;
    expect(andArgs).toContain(extraCond);
  });

  it('uses entity name in error message', async () => {
    const db = makeDb();
    db._chains.select.limit.mockResolvedValue([{ id: 'x' }]);

    await expect(
      ensureSlugUnique(
        db as never,
        { table: 'TABLE' as never, slugCol: 'SLUG_COL' as never, slug: 'dup' },
        'portfolio item'
      )
    ).rejects.toThrow('A portfolio item with slug "dup" already exists');
  });
});

// ======================== buildStatusCounts ========================

describe('buildStatusCounts', () => {
  it('returns numeric values from string SQL results', async () => {
    const db = makeDb();
    db._chains.select.where.mockResolvedValue([
      { active: '10', draft: '3', published: '5', scheduled: '2', trash: '1' },
    ]);

    const cols = {
      table: 'TABLE' as never,
      status: 'STATUS_COL' as never,
      deleted_at: 'DELETED_AT_COL' as never,
    };

    const result = await buildStatusCounts(db as never, cols);

    expect(result).toEqual({
      all: 10,
      draft: 3,
      published: 5,
      scheduled: 2,
      trash: 1,
    });
  });

  it('returns zeros when SQL returns nulls', async () => {
    const db = makeDb();
    db._chains.select.where.mockResolvedValue([
      { active: null, draft: null, published: null, scheduled: null, trash: null },
    ]);

    const cols = {
      table: 'TABLE' as never,
      status: 'STATUS_COL' as never,
      deleted_at: 'DELETED_AT_COL' as never,
    };

    const result = await buildStatusCounts(db as never, cols);

    expect(result).toEqual({ all: 0, draft: 0, published: 0, scheduled: 0, trash: 0 });
  });

  it('returns zeros when result set is empty', async () => {
    const db = makeDb();
    db._chains.select.where.mockResolvedValue([]);

    const cols = {
      table: 'TABLE' as never,
      status: 'STATUS_COL' as never,
      deleted_at: 'DELETED_AT_COL' as never,
    };

    const result = await buildStatusCounts(db as never, cols);

    expect(result).toEqual({ all: 0, draft: 0, published: 0, scheduled: 0, trash: 0 });
  });

  it('passes extraWhere to the query', async () => {
    const db = makeDb();
    db._chains.select.where.mockResolvedValue([
      { active: '5', draft: '1', published: '4', scheduled: '0', trash: '0' },
    ]);

    const cols = {
      table: 'TABLE' as never,
      status: 'STATUS_COL' as never,
      deleted_at: 'DELETED_AT_COL' as never,
    };
    const extraWhere = { type: 'extraWhere' } as never;

    await buildStatusCounts(db as never, cols, extraWhere);

    expect(db._chains.select.where).toHaveBeenCalledWith(extraWhere);
  });
});

// ======================== buildAdminList ========================

describe('buildAdminList', () => {
  function makeAdminListCols() {
    return {
      table: 'TABLE' as never,
      id: 'ID_COL' as never,
      deleted_at: 'DELETED_AT_COL' as never,
      lang: 'LANG_COL' as never,
      translation_group: 'TG_COL' as never,
    };
  }

  it('returns paginated results from findFn and count', async () => {
    const db = makeDb();
    const items = [{ id: '1' }, { id: '2' }];
    const findFn = vi.fn().mockResolvedValue(items);
    db._chains.select.where.mockResolvedValue([{ count: 25 }]);

    const result = await buildAdminList(
      {
        db: db as never,
        cols: makeAdminListCols(),
        input: { page: 2, pageSize: 10 },
        searchColumns: [],
        sortColumns: { createdAt: 'CREATED_AT' as never },
        defaultSort: 'createdAt',
      },
      findFn
    );

    expect(result).toEqual({
      results: items,
      total: 25,
      page: 2,
      pageSize: 10,
      totalPages: 3,
    });
    expect(findFn).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 10, limit: 10 })
    );
  });

  it('applies isNull(deleted_at) when trashed is false/undefined', async () => {
    const db = makeDb();
    const findFn = vi.fn().mockResolvedValue([]);
    db._chains.select.where.mockResolvedValue([{ count: 0 }]);

    const { isNull } = await import('drizzle-orm');

    await buildAdminList(
      {
        db: db as never,
        cols: makeAdminListCols(),
        input: {},
        searchColumns: [],
        sortColumns: { createdAt: 'CREATED_AT' as never },
        defaultSort: 'createdAt',
      },
      findFn
    );

    expect(isNull).toHaveBeenCalledWith('DELETED_AT_COL');
  });

  it('applies isNotNull(deleted_at) when trashed is true', async () => {
    const db = makeDb();
    const findFn = vi.fn().mockResolvedValue([]);
    db._chains.select.where.mockResolvedValue([{ count: 0 }]);

    const { isNotNull } = await import('drizzle-orm');

    await buildAdminList(
      {
        db: db as never,
        cols: makeAdminListCols(),
        input: { trashed: true },
        searchColumns: [],
        sortColumns: { createdAt: 'CREATED_AT' as never },
        defaultSort: 'createdAt',
      },
      findFn
    );

    expect(isNotNull).toHaveBeenCalledWith('DELETED_AT_COL');
  });

  it('applies lang filter when provided', async () => {
    const db = makeDb();
    const findFn = vi.fn().mockResolvedValue([]);
    db._chains.select.where.mockResolvedValue([{ count: 0 }]);

    const { eq } = await import('drizzle-orm');

    await buildAdminList(
      {
        db: db as never,
        cols: makeAdminListCols(),
        input: { lang: 'de' },
        searchColumns: [],
        sortColumns: { createdAt: 'CREATED_AT' as never },
        defaultSort: 'createdAt',
      },
      findFn
    );

    expect(eq).toHaveBeenCalledWith('LANG_COL', 'de');
  });

  it('applies search filter when provided', async () => {
    const db = makeDb();
    const findFn = vi.fn().mockResolvedValue([]);
    db._chains.select.where.mockResolvedValue([{ count: 0 }]);

    await buildAdminList(
      {
        db: db as never,
        cols: makeAdminListCols(),
        input: { search: 'hello world' },
        searchColumns: ['TITLE_COL' as never, 'SLUG_COL' as never],
        sortColumns: { createdAt: 'CREATED_AT' as never },
        defaultSort: 'createdAt',
      },
      findFn
    );

    expect(wordSplitLike).toHaveBeenCalledWith('hello world', [
      'TITLE_COL',
      'SLUG_COL',
    ]);
  });

  it('uses desc sort by default', async () => {
    const db = makeDb();
    const findFn = vi.fn().mockResolvedValue([]);
    db._chains.select.where.mockResolvedValue([{ count: 0 }]);

    const { desc } = await import('drizzle-orm');

    await buildAdminList(
      {
        db: db as never,
        cols: makeAdminListCols(),
        input: {},
        searchColumns: [],
        sortColumns: { createdAt: 'CREATED_AT' as never },
        defaultSort: 'createdAt',
      },
      findFn
    );

    expect(desc).toHaveBeenCalledWith('CREATED_AT');
  });

  it('uses asc sort when sortDir is asc', async () => {
    const db = makeDb();
    const findFn = vi.fn().mockResolvedValue([]);
    db._chains.select.where.mockResolvedValue([{ count: 0 }]);

    const { asc } = await import('drizzle-orm');

    await buildAdminList(
      {
        db: db as never,
        cols: makeAdminListCols(),
        input: { sortDir: 'asc' },
        searchColumns: [],
        sortColumns: { createdAt: 'CREATED_AT' as never },
        defaultSort: 'createdAt',
      },
      findFn
    );

    expect(asc).toHaveBeenCalledWith('CREATED_AT');
  });

  it('defaults to page 1, pageSize 50 when no input', async () => {
    const db = makeDb();
    const findFn = vi.fn().mockResolvedValue([]);
    db._chains.select.where.mockResolvedValue([{ count: 0 }]);

    const result = await buildAdminList(
      {
        db: db as never,
        cols: makeAdminListCols(),
        searchColumns: [],
        sortColumns: { createdAt: 'CREATED_AT' as never },
        defaultSort: 'createdAt',
      },
      findFn
    );

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(findFn).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, limit: 50 })
    );
  });

  it('runs findFn and count query in parallel', async () => {
    const db = makeDb();
    const callOrder: string[] = [];

    const findFn = vi.fn().mockImplementation(async () => {
      callOrder.push('find');
      return [];
    });
    db._chains.select.where.mockImplementation(async () => {
      callOrder.push('count');
      return [{ count: 0 }];
    });

    await buildAdminList(
      {
        db: db as never,
        cols: makeAdminListCols(),
        searchColumns: [],
        sortColumns: { createdAt: 'CREATED_AT' as never },
        defaultSort: 'createdAt',
      },
      findFn
    );

    // Both should be called (parallel via Promise.all)
    expect(findFn).toHaveBeenCalledTimes(1);
    expect(db.select).toHaveBeenCalled();
  });

  it('defaults count to 0 when count result is empty', async () => {
    const db = makeDb();
    const findFn = vi.fn().mockResolvedValue([]);
    db._chains.select.where.mockResolvedValue([]);

    const result = await buildAdminList(
      {
        db: db as never,
        cols: makeAdminListCols(),
        searchColumns: [],
        sortColumns: { createdAt: 'CREATED_AT' as never },
        defaultSort: 'createdAt',
      },
      findFn
    );

    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('includes extraConditions when provided', async () => {
    const db = makeDb();
    const findFn = vi.fn().mockResolvedValue([]);
    db._chains.select.where.mockResolvedValue([{ count: 0 }]);

    const { and } = await import('drizzle-orm');
    const extraCond = { type: 'extra' } as never;

    await buildAdminList(
      {
        db: db as never,
        cols: makeAdminListCols(),
        input: {},
        searchColumns: [],
        sortColumns: { createdAt: 'CREATED_AT' as never },
        defaultSort: 'createdAt',
        extraConditions: [extraCond],
      },
      findFn
    );

    // and() should receive the extra condition among its arguments
    const andArgs = asMock(and).mock.calls[0]!;
    expect(andArgs).toContain(extraCond);
  });
});
