import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { asMock } from '@/test-utils';

// --- Mocks ---

vi.mock('@/core/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/server/db', () => {
  return {
    db: {
      insert: vi.fn(),
      select: vi.fn(),
      update: vi.fn(),
    },
  };
});

vi.mock('@/server/db/schema/task-queue', () => ({
  saasTaskQueue: {
    id: 'id',
    queue: 'queue',
    payload: 'payload',
    status: 'status',
    priority: 'priority',
    attempts: 'attempts',
    maxAttempts: 'max_attempts',
    runAfter: 'run_after',
    lockedUntil: 'locked_until',
    lastError: 'last_error',
    result: 'result',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ _and: args }),
  eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
  lte: (a: unknown, b: unknown) => ({ _lte: [a, b] }),
  asc: (col: unknown) => ({ _asc: col }),
  desc: (col: unknown) => ({ _desc: col }),
}));

import { db as mockDb } from '@/server/db';
import {
  enqueueTask,
  pollAndProcess,
  startDbQueueWorker,
  recoverStaleTasks,
} from '../db-queue';

// --- Helpers ---

/** Set up a chain: db.insert(table).values(data) */
function mockInsertChain(resolvedValue: unknown = undefined) {
  const values = vi.fn().mockResolvedValue(resolvedValue);
  asMock(mockDb.insert).mockReturnValue({ values });
  return { values };
}

/** Set up a chain: db.select().from(t).where(c).orderBy(o).limit(n) OR db.select({}).from(t).where(c).limit(n) */
function mockSelectChain(rows: unknown[] = []) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy, limit });
  const from = vi.fn().mockReturnValue({ where });
  asMock(mockDb.select).mockReturnValue({ from });
  return { from, where, orderBy, limit };
}

/** Set up a chain: db.update(table).set(data).where(cond).returning(cols) OR db.update(table).set(data).where(cond) */
function _mockUpdateChain(returningRows?: unknown[]) {
  const returning = vi.fn().mockResolvedValue(returningRows ?? []);
  const where = vi.fn().mockReturnValue(
    returningRows !== undefined
      ? { returning }
      : Promise.resolve(undefined)
  );
  const set = vi.fn().mockReturnValue({ where });
  asMock(mockDb.update).mockReturnValue({ set });
  return { set, where, returning };
}

describe('db-queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('enqueueTask', () => {
    it('inserts a row with correct values and returns an id', async () => {
      const chain = mockInsertChain();

      const id = await enqueueTask('email', { to: 'user@test.com' });

      expect(typeof id).toBe('string');
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      expect(chain.values).toHaveBeenCalledTimes(1);

      const inserted = chain.values.mock.calls[0][0];
      expect(inserted.queue).toBe('email');
      expect(inserted.payload).toEqual({ to: 'user@test.com' });
      expect(inserted.priority).toBe(0);
      expect(inserted.maxAttempts).toBe(3);
      expect(inserted.runAfter).toBeInstanceOf(Date);
    });

    it('respects opts (priority, maxAttempts, runAfter)', async () => {
      const chain = mockInsertChain();
      const runAfter = new Date('2026-06-01T00:00:00Z');

      await enqueueTask('email', { data: 1 }, {
        priority: 10,
        maxAttempts: 5,
        runAfter,
      });

      const inserted = chain.values.mock.calls[0][0];
      expect(inserted.priority).toBe(10);
      expect(inserted.maxAttempts).toBe(5);
      expect(inserted.runAfter).toBe(runAfter);
    });
  });

  describe('pollAndProcess', () => {
    it('processes pending tasks and returns count', async () => {
      const task = {
        id: 'task-1',
        queue: 'email',
        payload: { to: 'a@b.com' },
        status: 'pending',
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        runAfter: new Date(),
        lockedUntil: null,
        lastError: null,
        result: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // SELECT pending tasks
      mockSelectChain([task]);

      // First update call: lock (returning with id) -> success
      // Second update call: mark completed -> void
      const lockReturning = vi.fn().mockResolvedValue([{ id: 'task-1' }]);
      const lockWhere = vi.fn().mockReturnValue({ returning: lockReturning });
      const completeWhere = vi.fn().mockResolvedValue(undefined);
      let updateCallCount = 0;
      asMock(mockDb.update).mockReturnValue({
        set: vi.fn().mockImplementation(() => {
          updateCallCount++;
          if (updateCallCount === 1) {
            return { where: lockWhere };
          }
          return { where: completeWhere };
        }),
      });

      const handler = vi.fn().mockResolvedValue({ sent: true });
      const processed = await pollAndProcess('email', handler);

      expect(processed).toBe(1);
      expect(handler).toHaveBeenCalledWith({ to: 'a@b.com' });
    });

    it('handles task failure with retry (increments attempts)', async () => {
      const task = {
        id: 'task-2',
        queue: 'email',
        payload: { to: 'fail@test.com' },
        status: 'pending',
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        runAfter: new Date(),
        lockedUntil: null,
        lastError: null,
        result: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSelectChain([task]);

      // Lock succeeds, then error update
      const lockReturning = vi.fn().mockResolvedValue([{ id: 'task-2' }]);
      const lockWhere = vi.fn().mockReturnValue({ returning: lockReturning });

      const errorWhere = vi.fn().mockResolvedValue(undefined);
      let updateCallCount = 0;
      const setMock = vi.fn();
      asMock(mockDb.update).mockReturnValue({
        set: setMock.mockImplementation(() => {
          updateCallCount++;
          if (updateCallCount === 1) {
            return { where: lockWhere };
          }
          return { where: errorWhere };
        }),
      });

      const handler = vi.fn().mockRejectedValue(new Error('SMTP timeout'));
      const processed = await pollAndProcess('email', handler);

      expect(processed).toBe(0);
      expect(handler).toHaveBeenCalledTimes(1);

      // The second set() call should have status 'pending' (retry, not dead)
      const errorSetArg = setMock.mock.calls[1][0];
      expect(errorSetArg.status).toBe('pending');
      expect(errorSetArg.attempts).toBe(1);
      expect(errorSetArg.lastError).toBe('SMTP timeout');
      expect(errorSetArg.lockedUntil).toBeNull();
    });

    it('marks task as dead when max attempts exceeded', async () => {
      const task = {
        id: 'task-3',
        queue: 'email',
        payload: {},
        status: 'pending',
        priority: 0,
        attempts: 2, // already at 2, maxAttempts is 3 -> next failure = dead
        maxAttempts: 3,
        runAfter: new Date(),
        lockedUntil: null,
        lastError: null,
        result: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSelectChain([task]);

      const lockReturning = vi.fn().mockResolvedValue([{ id: 'task-3' }]);
      const lockWhere = vi.fn().mockReturnValue({ returning: lockReturning });
      const errorWhere = vi.fn().mockResolvedValue(undefined);
      let updateCallCount = 0;
      const setMock = vi.fn();
      asMock(mockDb.update).mockReturnValue({
        set: setMock.mockImplementation(() => {
          updateCallCount++;
          if (updateCallCount === 1) {
            return { where: lockWhere };
          }
          return { where: errorWhere };
        }),
      });

      const handler = vi.fn().mockRejectedValue(new Error('fatal'));
      const processed = await pollAndProcess('email', handler);

      expect(processed).toBe(0);

      const errorSetArg = setMock.mock.calls[1][0];
      expect(errorSetArg.status).toBe('dead');
      expect(errorSetArg.attempts).toBe(3);
      expect(errorSetArg.lockedUntil).toBeNull();
    });

    it('skips already-locked tasks (returning empty from update)', async () => {
      const task = {
        id: 'task-4',
        queue: 'email',
        payload: {},
        status: 'pending',
        priority: 0,
        attempts: 0,
        maxAttempts: 3,
        runAfter: new Date(),
        lockedUntil: null,
        lastError: null,
        result: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSelectChain([task]);

      // Lock returns empty (another worker grabbed it)
      const lockReturning = vi.fn().mockResolvedValue([]);
      const lockWhere = vi.fn().mockReturnValue({ returning: lockReturning });
      asMock(mockDb.update).mockReturnValue({
        set: vi.fn().mockReturnValue({ where: lockWhere }),
      });

      const handler = vi.fn();
      const processed = await pollAndProcess('email', handler);

      expect(processed).toBe(0);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('recoverStaleTasks', () => {
    it('resets stale processing tasks to pending', async () => {
      const staleTasks = [
        { id: 'stale-1', attempts: 0, maxAttempts: 3 },
        { id: 'stale-2', attempts: 1, maxAttempts: 3 },
      ];

      mockSelectChain(staleTasks);

      const setMock = vi.fn();
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      setMock.mockReturnValue({ where: updateWhere });
      asMock(mockDb.update).mockReturnValue({ set: setMock });

      const recovered = await recoverStaleTasks();

      expect(recovered).toBe(2);
      expect(mockDb.update).toHaveBeenCalledTimes(2);

      // First task: attempts 0+1=1, still under maxAttempts=3 -> pending
      const firstSetArg = setMock.mock.calls[0][0];
      expect(firstSetArg.status).toBe('pending');
      expect(firstSetArg.attempts).toBe(1);
      expect(firstSetArg.lockedUntil).toBeNull();
      expect(firstSetArg.lastError).toBe('Recovered from stale processing state');

      // Second task: attempts 1+1=2, still under maxAttempts=3 -> pending
      const secondSetArg = setMock.mock.calls[1][0];
      expect(secondSetArg.status).toBe('pending');
      expect(secondSetArg.attempts).toBe(2);
    });

    it('marks stale tasks as dead when max attempts exceeded', async () => {
      const staleTasks = [
        { id: 'stale-dead', attempts: 2, maxAttempts: 3 },
      ];

      mockSelectChain(staleTasks);

      const setMock = vi.fn();
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      setMock.mockReturnValue({ where: updateWhere });
      asMock(mockDb.update).mockReturnValue({ set: setMock });

      const recovered = await recoverStaleTasks();

      expect(recovered).toBe(1);
      const setArg = setMock.mock.calls[0][0];
      expect(setArg.status).toBe('dead');
      expect(setArg.attempts).toBe(3);
    });
  });

  describe('startDbQueueWorker', () => {
    it('returns a stop function that halts polling', () => {
      // Mock the select chain so pollAndProcess finds no tasks
      mockSelectChain([]);

      const handler = vi.fn();
      const worker = startDbQueueWorker('email', handler, 1000);

      expect(worker).toHaveProperty('stop');
      expect(typeof worker.stop).toBe('function');

      // Stop immediately to prevent lingering timers
      worker.stop();
    });
  });
});
