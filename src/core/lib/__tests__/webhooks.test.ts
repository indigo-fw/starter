import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks ---

const { mockLog } = vi.hoisted(() => ({
  mockLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => mockLog,
}));

vi.mock('@/server/db/schema/webhooks', () => ({
  cmsWebhooks: {
    id: 'id',
    name: 'name',
    url: 'url',
    secret: 'secret',
    events: 'events',
    active: 'active',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
}));

let mockQueueInstance: { add: ReturnType<typeof vi.fn> } | null = null;

vi.mock('@/core/lib/infra/queue', () => ({
  createQueue: vi.fn(() => mockQueueInstance),
  createWorker: vi.fn().mockReturnValue(null),
}));

// --- Helpers ---

function flushPromises(ms = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMockDb(hooks: Array<{
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
}> = []) {
  const where = vi.fn().mockResolvedValue(hooks);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select, from, where } as unknown as import('@/server/db').DbClient & {
    select: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
  };
}

function createFailingDb(error: Error) {
  const where = vi.fn().mockRejectedValue(error);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select } as unknown as import('@/server/db').DbClient;
}

const sampleHook = {
  id: 'hook-1',
  url: 'https://example.com/webhook',
  secret: 'test-secret',
  events: ['post.created', 'post.updated'],
  active: true,
};

// --- Import SUT after mocks ---

import { dispatchWebhook } from '../webhooks/webhooks';

// --- Tests ---

describe('dispatchWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueueInstance = null;
    // Reset the internal _queue cache by re-importing isn't feasible,
    // so we control behavior through mockQueueInstance returned by createQueue.
    // Since _queue is lazily initialized and cached, we reset modules where needed.
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it('queries active webhooks from DB matching the event', async () => {
    const db = createMockDb([sampleHook]);

    dispatchWebhook(db, 'post.created', { id: '123' });
    await flushPromises();

    expect(db.select).toHaveBeenCalledOnce();
  });

  it('enqueues delivery to BullMQ queue when available', async () => {
    // We need a fresh module import to reset the internal _queue cache
    vi.resetModules();

    // Re-mock everything for fresh module
    vi.doMock('@/core/lib/infra/logger', () => ({
      createLogger: () => mockLog,
    }));
    vi.doMock('@/server/db/schema/webhooks', () => ({
      cmsWebhooks: {
        id: 'id', name: 'name', url: 'url', secret: 'secret',
        events: 'events', active: 'active',
        createdAt: 'created_at', updatedAt: 'updated_at',
      },
    }));
    vi.doMock('drizzle-orm', () => ({
      eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
    }));

    const mockAdd = vi.fn().mockResolvedValue({});
    const queueObj = { add: mockAdd };

    vi.doMock('@/core/lib/infra/queue', () => ({
      createQueue: vi.fn(() => queueObj),
      createWorker: vi.fn().mockReturnValue(null),
    }));

    const { dispatchWebhook: dispatch } = await import('../webhooks/webhooks');
    const db = createMockDb([sampleHook]);

    dispatch(db, 'post.created', { id: '123' });
    await flushPromises();

    expect(mockAdd).toHaveBeenCalledWith(
      'deliver',
      {
        url: sampleHook.url,
        secret: sampleHook.secret,
        event: 'post.created',
        payload: { id: '123' },
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
  });

  it('falls back to direct delivery when queue unavailable', async () => {
    vi.resetModules();

    vi.doMock('@/core/lib/infra/logger', () => ({
      createLogger: () => mockLog,
    }));
    vi.doMock('@/server/db/schema/webhooks', () => ({
      cmsWebhooks: {
        id: 'id', name: 'name', url: 'url', secret: 'secret',
        events: 'events', active: 'active',
        createdAt: 'created_at', updatedAt: 'updated_at',
      },
    }));
    vi.doMock('drizzle-orm', () => ({
      eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
    }));
    vi.doMock('@/core/lib/infra/queue', () => ({
      createQueue: vi.fn(() => null),
      createWorker: vi.fn().mockReturnValue(null),
    }));

    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;

    const { dispatchWebhook: dispatch } = await import('../webhooks/webhooks');
    const db = createMockDb([sampleHook]);

    dispatch(db, 'post.created', { id: '123' });
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      sampleHook.url,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Webhook-Signature': expect.any(String),
        }),
        body: expect.any(String),
      }),
    );

    // Verify the body contains the right event and payload
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.event).toBe('post.created');
    expect(body.data).toEqual({ id: '123' });
    expect(body.timestamp).toBeDefined();
  });

  it('does nothing when no active webhooks match the event', async () => {
    vi.resetModules();

    vi.doMock('@/core/lib/infra/logger', () => ({
      createLogger: () => mockLog,
    }));
    vi.doMock('@/server/db/schema/webhooks', () => ({
      cmsWebhooks: {
        id: 'id', name: 'name', url: 'url', secret: 'secret',
        events: 'events', active: 'active',
        createdAt: 'created_at', updatedAt: 'updated_at',
      },
    }));
    vi.doMock('drizzle-orm', () => ({
      eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
    }));

    const mockAdd = vi.fn().mockResolvedValue({});
    vi.doMock('@/core/lib/infra/queue', () => ({
      createQueue: vi.fn(() => ({ add: mockAdd })),
      createWorker: vi.fn().mockReturnValue(null),
    }));

    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    const { dispatchWebhook: dispatch } = await import('../webhooks/webhooks');

    // Hook exists but subscribes to different events
    const nonMatchingHook = {
      ...sampleHook,
      events: ['page.created', 'page.updated'],
    };
    const db = createMockDb([nonMatchingHook]);

    dispatch(db, 'post.created', { id: '123' });
    await flushPromises();

    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does nothing when DB returns no hooks', async () => {
    vi.resetModules();

    vi.doMock('@/core/lib/infra/logger', () => ({
      createLogger: () => mockLog,
    }));
    vi.doMock('@/server/db/schema/webhooks', () => ({
      cmsWebhooks: {
        id: 'id', name: 'name', url: 'url', secret: 'secret',
        events: 'events', active: 'active',
        createdAt: 'created_at', updatedAt: 'updated_at',
      },
    }));
    vi.doMock('drizzle-orm', () => ({
      eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
    }));
    vi.doMock('@/core/lib/infra/queue', () => ({
      createQueue: vi.fn(() => null),
      createWorker: vi.fn().mockReturnValue(null),
    }));

    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    const { dispatchWebhook: dispatch } = await import('../webhooks/webhooks');
    const db = createMockDb([]);

    dispatch(db, 'post.created', { id: '123' });
    await flushPromises();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('catches and logs DB query errors (never throws)', async () => {
    vi.resetModules();

    const logSpy = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    vi.doMock('@/core/lib/infra/logger', () => ({
      createLogger: () => logSpy,
    }));
    vi.doMock('@/server/db/schema/webhooks', () => ({
      cmsWebhooks: {
        id: 'id', name: 'name', url: 'url', secret: 'secret',
        events: 'events', active: 'active',
        createdAt: 'created_at', updatedAt: 'updated_at',
      },
    }));
    vi.doMock('drizzle-orm', () => ({
      eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
    }));
    vi.doMock('@/core/lib/infra/queue', () => ({
      createQueue: vi.fn(() => null),
      createWorker: vi.fn().mockReturnValue(null),
    }));

    const { dispatchWebhook: dispatch } = await import('../webhooks/webhooks');
    const db = createFailingDb(new Error('DB connection lost'));

    // Should not throw
    expect(() => dispatch(db, 'post.created', { id: '123' })).not.toThrow();
    await flushPromises();

    expect(logSpy.error).toHaveBeenCalledWith(
      'Failed to query webhooks',
      expect.objectContaining({
        event: 'post.created',
        error: expect.stringContaining('DB connection lost'),
      }),
    );
  });

  it('catches and logs direct delivery errors (never throws)', async () => {
    vi.resetModules();

    const logSpy = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    vi.doMock('@/core/lib/infra/logger', () => ({
      createLogger: () => logSpy,
    }));
    vi.doMock('@/server/db/schema/webhooks', () => ({
      cmsWebhooks: {
        id: 'id', name: 'name', url: 'url', secret: 'secret',
        events: 'events', active: 'active',
        createdAt: 'created_at', updatedAt: 'updated_at',
      },
    }));
    vi.doMock('drizzle-orm', () => ({
      eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
    }));
    vi.doMock('@/core/lib/infra/queue', () => ({
      createQueue: vi.fn(() => null),
      createWorker: vi.fn().mockReturnValue(null),
    }));

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    global.fetch = mockFetch;

    const { dispatchWebhook: dispatch } = await import('../webhooks/webhooks');
    const db = createMockDb([sampleHook]);

    expect(() => dispatch(db, 'post.created', { id: '123' })).not.toThrow();
    await flushPromises();

    expect(logSpy.warn).toHaveBeenCalledWith(
      'Webhook delivery failed',
      expect.objectContaining({
        url: sampleHook.url,
        event: 'post.created',
        error: expect.stringContaining('Network error'),
      }),
    );
  });

  it('logs warning when direct delivery gets non-ok HTTP response', async () => {
    vi.resetModules();

    const logSpy = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    vi.doMock('@/core/lib/infra/logger', () => ({
      createLogger: () => logSpy,
    }));
    vi.doMock('@/server/db/schema/webhooks', () => ({
      cmsWebhooks: {
        id: 'id', name: 'name', url: 'url', secret: 'secret',
        events: 'events', active: 'active',
        createdAt: 'created_at', updatedAt: 'updated_at',
      },
    }));
    vi.doMock('drizzle-orm', () => ({
      eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
    }));
    vi.doMock('@/core/lib/infra/queue', () => ({
      createQueue: vi.fn(() => null),
      createWorker: vi.fn().mockReturnValue(null),
    }));

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const { dispatchWebhook: dispatch } = await import('../webhooks/webhooks');
    const db = createMockDb([sampleHook]);

    dispatch(db, 'post.created', { id: '123' });
    await flushPromises();

    expect(logSpy.warn).toHaveBeenCalledWith(
      'Webhook delivery failed',
      expect.objectContaining({
        url: sampleHook.url,
        error: expect.stringContaining('HTTP 500'),
      }),
    );
  });

  it('dispatches to multiple matching hooks', async () => {
    vi.resetModules();

    vi.doMock('@/core/lib/infra/logger', () => ({
      createLogger: () => mockLog,
    }));
    vi.doMock('@/server/db/schema/webhooks', () => ({
      cmsWebhooks: {
        id: 'id', name: 'name', url: 'url', secret: 'secret',
        events: 'events', active: 'active',
        createdAt: 'created_at', updatedAt: 'updated_at',
      },
    }));
    vi.doMock('drizzle-orm', () => ({
      eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
    }));
    vi.doMock('@/core/lib/infra/queue', () => ({
      createQueue: vi.fn(() => null),
      createWorker: vi.fn().mockReturnValue(null),
    }));

    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;

    const { dispatchWebhook: dispatch } = await import('../webhooks/webhooks');

    const hook1 = { ...sampleHook, id: 'h1', url: 'https://one.com/hook' };
    const hook2 = { ...sampleHook, id: 'h2', url: 'https://two.com/hook' };
    const db = createMockDb([hook1, hook2]);

    dispatch(db, 'post.created', { id: '123' });
    await flushPromises();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledWith('https://one.com/hook', expect.anything());
    expect(mockFetch).toHaveBeenCalledWith('https://two.com/hook', expect.anything());
  });
});
