import { beforeEach, describe, expect, it, vi } from 'vitest';

import { asMock } from '@/test-utils';

const { mockLog, queueState } = vi.hoisted(() => ({
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  queueState: {
    queue: null as { upsertJobScheduler: ReturnType<typeof vi.fn> } | null,
  },
}));

vi.mock('@/core/lib/infra/logger', () => ({ createLogger: () => mockLog }));
vi.mock('@/core/lib/infra/queue', () => ({
  createQueue: vi.fn(() => queueState.queue),
  createWorker: vi.fn(() => null),
}));
vi.mock('@/core/lib/infra/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/core/lib/webhooks/webhooks', () => ({ dispatchWebhook: vi.fn() }));
vi.mock('@/server/db', () => ({ db: {} }));

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe('content-publish worker scheduling', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('arms the repeatable job from the shared definition at worker start', async () => {
    const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
    queueState.queue = { upsertJobScheduler };
    const mod = await import('../scheduled-publish');
    const { createWorker } = await import('@/core/lib/infra/queue');

    mod.startContentPublishWorker();
    await flush();

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      mod.CONTENT_PUBLISH_SCHEDULE.schedulerId,
      { every: mod.CONTENT_PUBLISH_SCHEDULE.everyMs }
    );
    expect(asMock(createWorker)).toHaveBeenCalledWith(
      mod.CONTENT_PUBLISH_SCHEDULE.queue,
      expect.any(Function)
    );
  });

  it('keeps the worker alive and warns when the scheduler upsert fails', async () => {
    queueState.queue = {
      upsertJobScheduler: vi.fn().mockRejectedValue(new Error('redis down')),
    };
    const mod = await import('../scheduled-publish');
    const { createWorker } = await import('@/core/lib/infra/queue');

    expect(() => mod.startContentPublishWorker()).not.toThrow();
    await flush();

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('content-publish schedule'),
      { error: 'Error: redis down' }
    );
    expect(asMock(createWorker)).toHaveBeenCalledTimes(1);
  });

  it('reports the schedule as skipped when there is no Redis queue', async () => {
    queueState.queue = null;
    const mod = await import('../scheduled-publish');

    await expect(mod.ensureContentPublishSchedule()).resolves.toBe(false);
  });
});
