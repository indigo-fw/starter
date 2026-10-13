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
vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/core-support/schema/support-chat', () => ({
  saasSupportChatSessions: {},
}));

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe('support-chat cleanup worker scheduling', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('arms the repeatable job from the shared definition at worker start', async () => {
    const upsertJobScheduler = vi.fn().mockResolvedValue(undefined);
    queueState.queue = { upsertJobScheduler };
    const mod = await import('../support-chat');
    const { createWorker } = await import('@/core/lib/infra/queue');

    mod.startSupportChatCleanupWorker();
    await flush();

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      mod.SUPPORT_CHAT_CLEANUP_SCHEDULE.schedulerId,
      { every: mod.SUPPORT_CHAT_CLEANUP_SCHEDULE.everyMs }
    );
    expect(asMock(createWorker)).toHaveBeenCalledWith(
      mod.SUPPORT_CHAT_CLEANUP_SCHEDULE.queue,
      expect.any(Function)
    );
  });

  it('keeps the worker alive and warns when the scheduler upsert fails', async () => {
    queueState.queue = {
      upsertJobScheduler: vi.fn().mockRejectedValue(new Error('redis down')),
    };
    const mod = await import('../support-chat');
    const { createWorker } = await import('@/core/lib/infra/queue');

    expect(() => mod.startSupportChatCleanupWorker()).not.toThrow();
    await flush();

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('support-chat-cleanup schedule'),
      { error: 'Error: redis down' }
    );
    expect(asMock(createWorker)).toHaveBeenCalledTimes(1);
  });

  it('reports the schedule as skipped when there is no Redis queue', async () => {
    queueState.queue = null;
    const mod = await import('../support-chat');

    await expect(mod.ensureSupportChatCleanupSchedule()).resolves.toBe(false);
  });
});
