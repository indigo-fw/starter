import {
  createQueue,
  createWorker,
  getOrCreateQueue,
  getQueues,
  shutdownAllWorkers,
} from '../infra/queue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above this file's declarations, so everything
// they reference must come from vi.hoisted().
const { warn, mainConn, producerConn, disconnectAll, FakeQueue, FakeWorker } =
  vi.hoisted(() => {
    class FakeQueue {
      name: string;
      opts: Record<string, unknown>;
      close = vi.fn().mockResolvedValue(undefined);
      add = vi.fn().mockResolvedValue({ id: 'job-1' });
      constructor(name: string, opts: Record<string, unknown>) {
        this.name = name;
        this.opts = opts;
      }
    }
    class FakeWorker {
      name: string;
      opts: Record<string, unknown>;
      close = vi.fn().mockResolvedValue(undefined);
      on = vi.fn().mockReturnThis();
      constructor(name: string, _p: unknown, opts: Record<string, unknown>) {
        this.name = name;
        this.opts = opts;
      }
    }
    return {
      warn: vi.fn(),
      mainConn: { kind: 'main' },
      producerConn: { kind: 'producer' },
      disconnectAll: vi.fn().mockResolvedValue(undefined),
      FakeQueue,
      FakeWorker,
    };
  });
type FakeQueue = InstanceType<typeof FakeQueue>;
type FakeWorker = InstanceType<typeof FakeWorker>;

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn, debug: vi.fn() }),
  wasLogged: () => false,
}));
vi.mock('@/core/lib/infra/redis', () => ({
  getRedis: vi.fn(() => mainConn),
  getProducerRedis: vi.fn(() => producerConn),
  disconnectAll: (...args: unknown[]) => disconnectAll(...args),
}));
vi.mock('bullmq', () => ({ Queue: FakeQueue, Worker: FakeWorker }));

describe('queue connections', () => {
  beforeEach(() => {
    warn.mockClear();
    disconnectAll.mockClear();
  });

  it('producers use the bounded-retry connection, workers the blocking one', () => {
    const q = createQueue('email') as unknown as FakeQueue;
    expect(q.opts.connection).toBe(producerConn);
    expect(q.opts.prefix).toBeTruthy();
    expect(q.opts.defaultJobOptions).toMatchObject({ attempts: 3 });

    const w = createWorker('email', async () => {}) as unknown as FakeWorker;
    expect(w.opts.connection).toBe(mainConn);
  });

  it('getOrCreateQueue returns the existing instance for a name', () => {
    const before = getQueues().length;
    const first = getOrCreateQueue('media-processing');
    const again = getOrCreateQueue('media-processing');
    expect(again).toBe(first);
    expect(getQueues().length).toBe(before + 1);
  });

  it('shutdownAllWorkers closes everything even when one close rejects', async () => {
    const w1 = createWorker('a', async () => {}) as unknown as FakeWorker;
    const w2 = createWorker('b', async () => {}) as unknown as FakeWorker;
    w1.close.mockRejectedValue(new Error('boom'));
    const queues = getQueues() as unknown as FakeQueue[];

    await expect(shutdownAllWorkers()).resolves.toBeUndefined();

    expect(w2.close).toHaveBeenCalled();
    for (const q of queues) expect(q.close).toHaveBeenCalled();
    expect(disconnectAll).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Failed to close worker',
      expect.objectContaining({ name: 'a', error: 'boom' })
    );
  });
});
