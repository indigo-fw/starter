import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));
vi.mock('@/core/storage', () => ({ getStorage: vi.fn() }));

// Capture registrations so the task under test can be pulled out by name.
const registered = new Map<string, () => Promise<void>>();
vi.mock('@/core/lib/infra/maintenance', () => ({
  registerMaintenanceTask: (name: string, fn: () => Promise<void>) => {
    registered.set(name, fn);
  },
}));

// Drizzle-shaped fake: the SELECT chain yields a sentinel subquery (never
// awaited — it is embedded in the DELETE), the DELETE chain yields batches.
const SUBQUERY = { __subquery: true };
const mockSelectWhere = vi.fn();
const mockLimit = vi.fn(() => SUBQUERY);
const mockReturning = vi.fn();
const mockDeleteWhere = vi.fn(() => ({ returning: mockReturning }));
const mockDelete = vi.fn((..._args: unknown[]) => ({ where: mockDeleteWhere }));
vi.mock('@/server/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: (...args: unknown[]) => {
          mockSelectWhere(...args);
          return { limit: mockLimit };
        },
      })),
    })),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

await import('../index');

const dialect = new PgDialect();
const BATCH = 5000;
const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `evt-${i}` }));

describe('cleanupProcessedWebhookEvents maintenance task', () => {
  const task = registered.get('cleanupProcessedWebhookEvents');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is registered with the maintenance registry', () => {
    expect(task).toBeTypeOf('function');
  });

  it('deletes rows older than 90 days, selected in batches of 5000', async () => {
    mockReturning.mockResolvedValueOnce(ids(12));
    const before = Date.now();

    await task!();

    expect(mockLimit).toHaveBeenCalledWith(BATCH);
    const where = mockSelectWhere.mock.calls[0]?.[0] as SQL;
    const { sql, params } = dialect.sqlToQuery(where);
    expect(sql).toMatch(/"created_at" < \$1/);
    // The dialect maps the Date through the timestamp column's driver mapping.
    const cutoff = new Date(params[0] as string | Date).getTime();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    expect(before - cutoff).toBeGreaterThanOrEqual(ninetyDays - 1000);
    expect(before - cutoff).toBeLessThan(ninetyDays + 5000);
  });

  it('keeps deleting while batches come back full and stops on a short batch', async () => {
    mockReturning
      .mockResolvedValueOnce(ids(BATCH))
      .mockResolvedValueOnce(ids(BATCH))
      .mockResolvedValueOnce(ids(7));

    await task!();

    expect(mockDelete).toHaveBeenCalledTimes(3);
  });

  it('stops after one delete when nothing is old enough', async () => {
    mockReturning.mockResolvedValueOnce([]);

    await task!();

    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('caps a single run at 20 batches so a huge backlog cannot monopolise the nightly window', async () => {
    mockReturning.mockResolvedValue(ids(BATCH));

    await task!();

    expect(mockDelete).toHaveBeenCalledTimes(20);
  });
});
