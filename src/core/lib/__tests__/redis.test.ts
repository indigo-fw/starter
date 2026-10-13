import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.fn();
const info = vi.fn();
vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({ info, error: vi.fn(), warn, debug: vi.fn() }),
}));

// `lazyConnect` via the URL query (ioredis merges query params into options)
// keeps the real ioredis client from dialing — the vitest network guard would
// deny the TCP connect. Everything asserted here is option/event plumbing.
const LAZY_URL = 'redis://127.0.0.1:6379/?lazyConnect=true';

type RedisModule = typeof import('../infra/redis');

async function loadFresh(): Promise<RedisModule> {
  vi.resetModules();
  return import('../infra/redis');
}

describe('redis connection profiles', () => {
  beforeEach(() => {
    process.env.REDIS_URL = LAZY_URL;
    warn.mockClear();
    info.mockClear();
  });

  afterEach(async () => {
    delete process.env.REDIS_URL;
    vi.useRealTimers();
  });

  it('returns null for every profile when REDIS_URL is unset', async () => {
    delete process.env.REDIS_URL;
    const redis = await loadFresh();
    expect(redis.getRedis()).toBeNull();
    expect(redis.getProducerRedis()).toBeNull();
    expect(redis.getRequestRedis()).toBeNull();
    expect(redis.getSubscriber()).toBeNull();
    expect(redis.getPublisher()).toBeNull();
  });

  it('producer profile bounds retries while keeping the offline queue', async () => {
    const redis = await loadFresh();
    const producer = redis.getProducerRedis()!;
    expect(producer.options.maxRetriesPerRequest).toBe(3);
    expect(producer.options.connectTimeout).toBe(5000);
    expect(producer.options.enableOfflineQueue).toBe(true);
    // Distinct from the worker connection — the worker profile must stay
    // `maxRetriesPerRequest: null` for BullMQ's blocking commands.
    const main = redis.getRedis()!;
    expect(main).not.toBe(producer);
    expect(main.options.maxRetriesPerRequest).toBeNull();
    expect(redis.getProducerRedis()).toBe(producer); // cached singleton
    await redis.disconnectAll();
  });

  it('request profile has a command timeout so a stalled Redis fails open', async () => {
    const redis = await loadFresh();
    const req = redis.getRequestRedis()!;
    expect(req.options.commandTimeout).toBe(500);
    expect(req.options.maxRetriesPerRequest).toBe(1);
    expect(req.options.enableOfflineQueue).toBe(false);
    await redis.disconnectAll();
  });

  it('logs connection errors once per outage and re-arms on ready', async () => {
    const redis = await loadFresh();
    const conn = redis.getRequestRedis()!;

    // Without a listener EventEmitter would throw here (ioredis' fallback is a
    // raw console.error) — the listener must exist AND dedupe.
    expect(() => conn.emit('error', new Error('ECONNREFUSED'))).not.toThrow();
    conn.emit('error', new Error('ECONNREFUSED'));
    conn.emit('error', new Error('ECONNREFUSED'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Redis connection error',
      expect.objectContaining({ role: 'request', error: 'ECONNREFUSED' })
    );

    conn.emit('ready');
    expect(info).toHaveBeenCalledWith(
      'Redis connection recovered',
      expect.objectContaining({ role: 'request' })
    );
    conn.emit('error', new Error('ECONNRESET'));
    expect(warn).toHaveBeenCalledTimes(2);

    await redis.disconnectAll();
  });

  it('disconnectAll quits gracefully, then cuts the socket', async () => {
    const redis = await loadFresh();
    const conn = redis.getRedis()!;
    const quit = vi.spyOn(conn, 'quit').mockResolvedValue('OK');
    const disconnect = vi
      .spyOn(conn, 'disconnect')
      .mockImplementation(() => {});

    await redis.disconnectAll();

    expect(quit).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    // The registry is cleared, so a later call creates a fresh connection.
    expect(redis.getRedis()).not.toBe(conn);
    await redis.disconnectAll();
  });

  it('disconnectAll falls back to disconnect() when quit() never completes', async () => {
    vi.useFakeTimers();
    const redis = await loadFresh();
    const conn = redis.getRedis()!;
    vi.spyOn(conn, 'quit').mockReturnValue(new Promise(() => {}));
    const disconnect = vi
      .spyOn(conn, 'disconnect')
      .mockImplementation(() => {});

    const done = redis.disconnectAll();
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnectAll closes every connection even when one quit() rejects', async () => {
    const redis = await loadFresh();
    const a = redis.getRedis()!;
    const b = redis.getRequestRedis()!;
    vi.spyOn(a, 'quit').mockRejectedValue(new Error('Connection is closed.'));
    vi.spyOn(b, 'quit').mockResolvedValue('OK');
    const da = vi.spyOn(a, 'disconnect').mockImplementation(() => {});
    const dbSpy = vi.spyOn(b, 'disconnect').mockImplementation(() => {});

    await expect(redis.disconnectAll()).resolves.toBeUndefined();

    expect(da).toHaveBeenCalledTimes(1);
    expect(dbSpy).toHaveBeenCalledTimes(1);
  });
});
