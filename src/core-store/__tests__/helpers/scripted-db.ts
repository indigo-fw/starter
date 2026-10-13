import { vi } from 'vitest';

/**
 * Scripted Drizzle double for refund-flow tests. Every `db.select(...)` chain
 * resolves the next entry of `selectQueue`; every `db.update(...)` chain
 * resolves the next entry of `updateQueue` and records what it wrote, so a
 * test can assert claim/CAS ordering without a database. `transaction` runs
 * the callback against the same double. Wire it up with
 * `vi.mock('@/server/db', async () => ({ db: (await import('./helpers/scripted-db')).scripted.db }))`.
 */
export interface RecordedUpdate {
  table: unknown;
  set: Record<string, unknown>;
}

function chain(resolve: () => unknown): Record<string, unknown> {
  const node: Record<string, unknown> = {};
  const self = vi.fn(() => node);
  for (const m of [
    'from',
    'where',
    'innerJoin',
    'groupBy',
    'orderBy',
    'limit',
    'offset',
    'returning',
  ]) {
    node[m] = self;
  }
  node.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve().then(resolve).then(res, rej);
  return node;
}

export function createScriptedDb() {
  const selectQueue: unknown[] = [];
  const updateQueue: unknown[] = [];
  const updates: RecordedUpdate[] = [];

  const db = {
    select: vi.fn(() => chain(() => selectQueue.shift())),
    update: vi.fn((table: unknown) => {
      const node = chain(() => updateQueue.shift());
      node.set = vi.fn((values: Record<string, unknown>) => {
        updates.push({ table, set: values });
        return node;
      });
      return node;
    }),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  };

  function reset() {
    selectQueue.length = 0;
    updateQueue.length = 0;
    updates.length = 0;
  }

  return { db, selectQueue, updateQueue, updates, reset };
}

export const scripted = createScriptedDb();
