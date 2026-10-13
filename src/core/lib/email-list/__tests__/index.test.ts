import {
  type EmailListProvider,
  EmailListProviderError,
  hashEmail,
  processEmailListJob,
  registerEmailListProvider,
  syncSubscriber,
  tagSubscriber,
} from '../index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  logError,
  logWarn,
  queueAdd,
  getOrCreateQueue,
  createWorker,
  enqueueTask,
  startDbQueueWorker,
} = vi.hoisted(() => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  queueAdd: vi.fn().mockResolvedValue({ id: 'job-1' }),
  getOrCreateQueue: vi.fn(),
  createWorker: vi.fn(),
  enqueueTask: vi.fn().mockResolvedValue('task-1'),
  startDbQueueWorker: vi.fn().mockReturnValue({ stop: vi.fn() }),
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: logWarn,
    error: logError,
  }),
  markLogged: (err: unknown) => err,
}));
vi.mock('@/core/lib/infra/queue', () => ({ getOrCreateQueue, createWorker }));
vi.mock('@/core/lib/infra/db-queue', () => ({
  enqueueTask,
  startDbQueueWorker,
}));

const EMAIL = 'alice@example.com';

function makeProvider(): EmailListProvider & {
  subscribe: ReturnType<typeof vi.fn>;
  tag: ReturnType<typeof vi.fn>;
} {
  return {
    subscribe: vi.fn().mockResolvedValue(undefined),
    tag: vi.fn().mockResolvedValue(undefined),
  };
}

/** Every string anywhere in the logger's arguments. */
function loggedStrings(mock: ReturnType<typeof vi.fn>): string {
  return JSON.stringify(mock.mock.calls);
}

describe('email-list sync through the queue', () => {
  const ORIGINAL = {
    provider: process.env.EMAIL_LIST_PROVIDER,
    role: process.env.SERVER_ROLE,
  };
  let provider: ReturnType<typeof makeProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = makeProvider();
    process.env.EMAIL_LIST_PROVIDER = 'test';
    // Registration auto-starts the worker in worker-capable processes; keep
    // these tests about enqueueing by registering as a frontend role.
    process.env.SERVER_ROLE = 'frontend';
    registerEmailListProvider('test', () => provider);
    getOrCreateQueue.mockReturnValue({ add: queueAdd });
  });

  afterEach(() => {
    process.env.EMAIL_LIST_PROVIDER = ORIGINAL.provider;
    process.env.SERVER_ROLE = ORIGINAL.role;
  });

  it('enqueues a subscribe job instead of calling the provider inline', async () => {
    syncSubscriber(EMAIL, { plan: 'pro' });
    await vi.waitFor(() => expect(queueAdd).toHaveBeenCalledTimes(1));

    expect(queueAdd).toHaveBeenCalledWith(
      'subscribe',
      { op: 'subscribe', email: EMAIL, fields: { plan: 'pro' } },
      expect.objectContaining({ attempts: 6 })
    );
    expect(provider.subscribe).not.toHaveBeenCalled();
  });

  it('enqueues a tag job with the email retry policy', async () => {
    tagSubscriber(EMAIL, ['pro']);
    await vi.waitFor(() => expect(queueAdd).toHaveBeenCalledTimes(1));

    expect(queueAdd).toHaveBeenCalledWith(
      'tag',
      { op: 'tag', email: EMAIL, tags: ['pro'] },
      { attempts: 6, backoff: { type: 'exponential', delay: 5 * 60_000 } }
    );
    expect(provider.tag).not.toHaveBeenCalled();
  });

  it('falls back to the DB task queue when Redis is absent', async () => {
    getOrCreateQueue.mockReturnValue(null);
    tagSubscriber(EMAIL, ['churned']);
    await vi.waitFor(() => expect(enqueueTask).toHaveBeenCalledTimes(1));

    expect(enqueueTask).toHaveBeenCalledWith(
      'email-list',
      { op: 'tag', email: EMAIL, tags: ['churned'] },
      { maxAttempts: 6 }
    );
    expect(queueAdd).not.toHaveBeenCalled();
    expect(provider.tag).not.toHaveBeenCalled();
  });

  it('does nothing when no provider is active', async () => {
    delete process.env.EMAIL_LIST_PROVIDER;
    syncSubscriber(EMAIL);
    await new Promise((r) => setTimeout(r, 0));
    expect(queueAdd).not.toHaveBeenCalled();
    expect(enqueueTask).not.toHaveBeenCalled();
  });

  it('logs enqueue failures with a hashed address, never the raw email', async () => {
    queueAdd.mockRejectedValueOnce(new Error('redis timeout'));
    tagSubscriber(EMAIL, ['pro']);
    await vi.waitFor(() => expect(logError).toHaveBeenCalledTimes(1));

    expect(logError).toHaveBeenCalledWith(
      'Failed to enqueue subscriber tag',
      expect.objectContaining({ emailHash: hashEmail(EMAIL), tags: ['pro'] })
    );
    expect(loggedStrings(logError)).not.toContain(EMAIL);
  });

  describe('worker', () => {
    it('runs the provider call for a queued job', async () => {
      await processEmailListJob({ op: 'tag', email: EMAIL, tags: ['pro'] });
      expect(provider.tag).toHaveBeenCalledWith(EMAIL, ['pro']);

      await processEmailListJob({
        op: 'subscribe',
        email: EMAIL,
        fields: { a: 1 },
      });
      expect(provider.subscribe).toHaveBeenCalledWith(EMAIL, { a: 1 });
    });

    it('rethrows provider failures so the queue retries, logging only a hash', async () => {
      provider.tag.mockRejectedValueOnce(
        new EmailListProviderError('HTTP 503', 503)
      );
      await expect(
        processEmailListJob({ op: 'tag', email: EMAIL, tags: ['pro'] })
      ).rejects.toThrow('HTTP 503');

      expect(logError).toHaveBeenCalledWith(
        'Email-list provider call failed',
        expect.objectContaining({ op: 'tag', emailHash: hashEmail(EMAIL) })
      );
      expect(loggedStrings(logError)).not.toContain(EMAIL);
    });

    it('turns a non-429 4xx into an unrecoverable job', async () => {
      provider.subscribe.mockRejectedValueOnce(
        new EmailListProviderError('HTTP 422', 422)
      );
      await expect(
        processEmailListJob({ op: 'subscribe', email: EMAIL })
      ).rejects.toMatchObject({ name: 'UnrecoverableError' });
    });

    it('keeps a 429 retryable', async () => {
      const err = new EmailListProviderError('HTTP 429', 429);
      provider.subscribe.mockRejectedValueOnce(err);
      await expect(
        processEmailListJob({ op: 'subscribe', email: EMAIL })
      ).rejects.toBe(err);
    });

    it('drops malformed payloads without calling the provider', async () => {
      await processEmailListJob({ op: 'tag' });
      await processEmailListJob('junk');
      expect(provider.tag).not.toHaveBeenCalled();
      expect(logWarn).toHaveBeenCalledWith(
        'Dropping malformed email-list job',
        expect.anything()
      );
    });

    it('registration never starts the worker — server.ts does, explicitly (BullMQ)', async () => {
      createWorker.mockReturnValue({ name: 'email-list' });
      vi.resetModules();
      const fresh = await import('../index');

      fresh.registerEmailListProvider('test', () => provider);
      expect(createWorker).not.toHaveBeenCalled();

      fresh.startEmailListWorker();
      fresh.startEmailListWorker(); // idempotent
      expect(createWorker).toHaveBeenCalledTimes(1);
      expect(createWorker).toHaveBeenCalledWith(
        'email-list',
        expect.any(Function),
        2
      );
      expect(startDbQueueWorker).not.toHaveBeenCalled();
    });

    it('falls back to the DB queue poller without Redis', async () => {
      createWorker.mockReturnValue(null);
      vi.resetModules();
      const fresh = await import('../index');

      fresh.registerEmailListProvider('test', () => provider);
      fresh.startEmailListWorker();
      await vi.waitFor(() =>
        expect(startDbQueueWorker).toHaveBeenCalledWith(
          'email-list',
          expect.any(Function),
          expect.any(Number)
        )
      );
    });
  });
});
