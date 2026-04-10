import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  auth: {
    api: { getSession: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock('@/core/lib/infra/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

vi.mock('@/core/lib/api/trpc-rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/core/lib/infra/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    BETTER_AUTH_SECRET: 'test-secret',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    DEEPL_API_KEY: '',
  },
}));

vi.mock('@/server/lib/resolve-org', () => ({
  resolveOrgId: vi.fn().mockResolvedValue('org-1'),
}));

import { asMock } from '@/test-utils';
import { projectsRouter } from '../projects';
import { logAudit } from '@/core/lib/infra/audit';
import { resolveOrgId } from '@/server/lib/resolve-org';

const TEST_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

/** Builds a mock Drizzle chain. Call `.resolve(data)` to set what the terminal method returns. */
function _chain(terminal = 'limit') {
  const result = { data: [] as unknown[] };
  const terminalFn = vi.fn(() => Promise.resolve(result.data));

  // Build chain bottom-up so each level returns the next
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const order =
    terminal === 'returning'
      ? ['select', 'from', 'where', 'returning']
      : terminal === 'offset'
        ? ['select', 'from', 'where', 'orderBy', 'limit', 'offset']
        : ['select', 'from', 'where', 'limit'];

  let current: unknown = terminalFn;
  for (let i = order.length - 1; i >= 0; i--) {
    const fn = vi.fn(() => current);
    methods[order[i]!] = fn;
    current = { [order[i + 1] ?? '']: current, ...spreadRemaining(order, i, methods) };
  }

  return {
    head: methods[order[0]!]!,
    resolve(data: unknown[]) {
      result.data = data;
      return this;
    },
  };
}

function spreadRemaining(
  order: string[],
  fromIdx: number,
  methods: Record<string, ReturnType<typeof vi.fn>>,
) {
  const out: Record<string, unknown> = {};
  for (let j = fromIdx + 2; j < order.length; j++) {
    out[order[j]!] = methods[order[j]!];
  }
  return out;
}

/**
 * Creates a mock DB where `.select()` calls return results in sequence.
 * Each entry in `selectResults` feeds one `db.select()` call chain.
 */
function mockDb({
  selectResults = [] as unknown[][],
  insertResult = [] as unknown[],
  updateResult = [] as unknown[],
} = {}) {
  let selectIdx = 0;

  return {
    select: vi.fn(() => {
      const data = selectResults[selectIdx++] ?? [];
      return {
        from: vi.fn(() => ({
          where: vi.fn((_c: unknown) => {
            // Support both Promise.all parallel queries (count) and chained queries
            return {
              limit: vi.fn(() => Promise.resolve(data)),
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => ({
                  offset: vi.fn(() => Promise.resolve(data)),
                })),
              })),
              // For count queries called directly via Promise.all
              then: (resolve: (v: unknown) => void) => Promise.resolve(data).then(resolve),
            };
          }),
        })),
      };
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve(insertResult)),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(updateResult)),
        })),
      })),
    })),
  };
}

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    session: { user: { id: 'user-1', email: 'test@test.com', role: 'admin' } },
    db: mockDb(),
    headers: new Headers(),
    activeOrganizationId: 'org-1',
    ...overrides,
  };
}

function caller(c: ReturnType<typeof ctx>) {
  return projectsRouter.createCaller(c as never);
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('projectsRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(resolveOrgId).mockImplementation(async (activeOrgId: string | null) => {
      if (activeOrgId) return activeOrgId;
      throw new Error('No active organization selected');
    });
  });

  // ── requireOrg guard ────────────────────────────────────────────────────

  it.each(['list', 'create', 'get', 'update', 'delete'] as const)(
    '%s throws when no active organization',
    async (procedure) => {
      const c = ctx({ activeOrganizationId: null });

      const input =
        procedure === 'list'
          ? undefined
          : procedure === 'create'
            ? { name: 'X' }
            : { id: TEST_UUID, ...(procedure === 'update' ? { name: 'X' } : {}) };

      await expect((caller(c) as Record<string, (i?: unknown) => Promise<unknown>>)[procedure](input)).rejects.toThrow(
        'No active organization selected',
      );
    },
  );

  // ── requireMember guard ─────────────────────────────────────────────────

  it('throws when user is not a member', async () => {
    const c = ctx({
      db: mockDb({ selectResults: [[]] }), // empty = not a member
    });

    await expect(caller(c).list()).rejects.toThrow('Not a member of this organization');
  });

  // ── list ────────────────────────────────────────────────────────────────

  it('list returns paginated results', async () => {
    const projects = [{ id: 'p1', name: 'Project 1' }];
    const c = ctx({
      db: mockDb({
        selectResults: [
          [{ id: 'member-1' }], // requireMember
          projects,              // results query
          [{ count: 1 }],       // count query
        ],
      }),
    });

    const result = await caller(c).list({ page: 1, pageSize: 20 });
    expect(result.results).toEqual(projects);
    expect(result.total).toBe(1);
  });

  // ── create ──────────────────────────────────────────────────────────────

  it('create inserts project and logs audit', async () => {
    const project = { id: 'proj-1', name: 'Test', organizationId: 'org-1' };
    const c = ctx({
      db: mockDb({
        selectResults: [[{ id: 'member-1' }]],
        insertResult: [project],
      }),
    });

    const result = await caller(c).create({ name: 'Test' });

    expect(result).toEqual(project);
    expect(asMock(logAudit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'project.create',
        entityType: 'project',
        entityId: 'proj-1',
      }),
    );
  });

  // ── get ─────────────────────────────────────────────────────────────────

  it('get throws when project not found', async () => {
    const c = ctx({
      db: mockDb({
        selectResults: [
          [{ id: 'member-1' }], // requireMember
          [],                    // project not found
        ],
      }),
    });

    await expect(caller(c).get({ id: TEST_UUID })).rejects.toThrow('Project not found');
  });

  // ── update ──────────────────────────────────────────────────────────────

  it('update returns updated project and logs audit', async () => {
    const updated = { id: TEST_UUID, name: 'Updated' };
    const c = ctx({
      db: mockDb({
        selectResults: [[{ id: 'member-1' }]],
        updateResult: [updated],
      }),
    });

    const result = await caller(c).update({ id: TEST_UUID, name: 'Updated' });

    expect(result).toEqual(updated);
    expect(asMock(logAudit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'project.update',
        entityType: 'project',
        entityId: TEST_UUID,
      }),
    );
  });

  it('update throws when project not found', async () => {
    const c = ctx({
      db: mockDb({
        selectResults: [[{ id: 'member-1' }]],
        updateResult: [],
      }),
    });

    await expect(caller(c).update({ id: TEST_UUID, name: 'X' })).rejects.toThrow('Project not found');
  });

  // ── delete ──────────────────────────────────────────────────────────────

  it('delete soft-deletes and logs audit', async () => {
    const c = ctx({
      db: mockDb({
        selectResults: [[{ id: 'member-1' }]],
        updateResult: [{ id: TEST_UUID }],
      }),
    });

    const result = await caller(c).delete({ id: TEST_UUID });

    expect(result).toEqual({ success: true });
    expect(asMock(logAudit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'project.delete',
        entityType: 'project',
        entityId: TEST_UUID,
      }),
    );
  });

  it('delete throws when project not found', async () => {
    const c = ctx({
      db: mockDb({
        selectResults: [[{ id: 'member-1' }]],
        updateResult: [],
      }),
    });

    await expect(caller(c).delete({ id: TEST_UUID })).rejects.toThrow('Project not found');
  });
});
