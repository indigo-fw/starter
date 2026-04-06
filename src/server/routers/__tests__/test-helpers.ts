import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// createMockDb
//
// Builds a mock Drizzle database client that covers the complete set of query
// builder chains used across all router tests:
//
//   insert:  insert().values().returning()
//   select:  select().from().where().orderBy().offset().limit()
//            select().from().innerJoin().where().orderBy().offset().limit()
//            select().from().leftJoin().where().groupBy().orderBy().limit()
//            select().from().where().groupBy().orderBy().limit()
//            select().from().orderBy().limit()
//            select().from().limit()
//   update:  update().set().where()
//   delete:  delete().where()
//
// The `_chains` map exposes the internal mock functions so tests can control
// return values and assert call arguments:
//
//   ctx.db._chains.select.limit.mockResolvedValue([MOCK_ITEM])
//   ctx.db._chains.insert.returning.mockResolvedValue([CREATED_ITEM])
//
// Tests that require non-standard select chains (affiliates, support) or that
// need multiple concurrent select() calls returning different data sets should
// build their own db mock inline — `createMockDb` is not designed to cover
// those edge cases.
// ---------------------------------------------------------------------------

export function createMockDb() {
  // ---- insert chain -------------------------------------------------------
  const insertReturningMock = vi.fn().mockResolvedValue([]);
  const insertValuesMock = vi.fn().mockReturnValue({ returning: insertReturningMock });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  // ---- select chain -------------------------------------------------------
  // All chains share a single terminal (`selectLimitMock`) so that
  // `ctx.db._chains.select.limit.mockResolvedValue(...)` works regardless of
  // which intermediate methods the router calls.
  const selectLimitMock = vi.fn().mockResolvedValue([]);
  const selectOffsetMock = vi.fn().mockReturnValue({ limit: selectLimitMock });
  const selectGroupByMock = vi.fn().mockReturnValue({
    orderBy: vi.fn().mockReturnValue({ limit: selectLimitMock }),
    limit: selectLimitMock,
  });
  const selectOrderByMock = vi.fn().mockReturnValue({
    offset: selectOffsetMock,
    limit: selectLimitMock,
  });

  // Shared where mock — supports all continuations used by routers.
  const selectWhereMock = vi.fn().mockReturnValue({
    orderBy: selectOrderByMock,
    offset: selectOffsetMock,
    limit: selectLimitMock,
    groupBy: selectGroupByMock,
  });

  // innerJoin / leftJoin — both expose `.where()` which terminates at selectWhereMock.
  const selectInnerJoinMock = vi.fn().mockReturnValue({ where: selectWhereMock });
  const selectLeftJoinMock = vi.fn().mockReturnValue({ where: selectWhereMock });

  // from() — supports all continuation paths used by routers.
  const selectFromMock = vi.fn().mockReturnValue({
    where: selectWhereMock,
    innerJoin: selectInnerJoinMock,
    leftJoin: selectLeftJoinMock,
    orderBy: selectOrderByMock,
    limit: selectLimitMock,
  });

  const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });

  // ---- update chain -------------------------------------------------------
  const updateWhereMock = vi.fn().mockResolvedValue(undefined);
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

  // ---- delete chain -------------------------------------------------------
  const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
  const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });

  return {
    select: selectMock,
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
    /** Exposed internal mocks for per-test control and assertion. */
    _chains: {
      select: {
        from: selectFromMock,
        where: selectWhereMock,
        orderBy: selectOrderByMock,
        offset: selectOffsetMock,
        limit: selectLimitMock,
        groupBy: selectGroupByMock,
        innerJoin: selectInnerJoinMock,
        leftJoin: selectLeftJoinMock,
      },
      insert: { values: insertValuesMock, returning: insertReturningMock },
      update: { set: updateSetMock, where: updateWhereMock },
      delete: { where: deleteWhereMock },
    },
  };
}

// ---------------------------------------------------------------------------
// createMockCtx
//
// Standard tRPC context for router tests. Defaults match the most common
// test setup (editor role, no active org).
//
// Override any field by passing `overrides`:
//   createMockCtx({ session: { user: { id: 'u', email: 'e', role: 'admin' } } })
//   createMockCtx({ activeOrganizationId: 'org-1' })
//   createMockCtx({ db: customDb })
// ---------------------------------------------------------------------------

export function createMockCtx(overrides: Record<string, unknown> = {}) {
  const db = createMockDb();
  return {
    session: {
      user: { id: 'user-1', email: 'editor@test.com', role: 'editor' },
    },
    db,
    headers: new Headers(),
    activeOrganizationId: null,
    ...overrides,
  };
}
