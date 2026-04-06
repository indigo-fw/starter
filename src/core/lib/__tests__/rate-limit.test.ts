import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit, type RateLimitConfig } from '../rate-limit';

const defaultConfig: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 5,
};

function createMockRedis(overrides: {
  pipelineResults?: (readonly [Error | null, unknown])[];
  zrangeResult?: string[];
} = {}) {
  const pipelineMethods = {
    zremrangebyscore: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(
      overrides.pipelineResults ?? [
        [null, 0], // zremrangebyscore
        [null, 1], // zadd
        [null, 1], // zcard — count of entries in window
        [null, 1], // expire
      ]
    ),
  };

  return {
    pipeline: vi.fn().mockReturnValue(pipelineMethods),
    zrange: vi.fn().mockResolvedValue(overrides.zrangeResult ?? []),
    _pipeline: pipelineMethods,
  } as unknown as import('ioredis').default & {
    _pipeline: typeof pipelineMethods;
  };
}

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns allowed when redis is null (fail-open)', async () => {
    const result = await checkRateLimit(null, 'test-key', defaultConfig);

    expect(result).toEqual({
      allowed: true,
      remaining: defaultConfig.maxRequests,
      retryAfterMs: 0,
    });
  });

  it('returns allowed when count is within limit', async () => {
    const redis = createMockRedis({
      pipelineResults: [
        [null, 0],
        [null, 1],
        [null, 3], // zcard: 3 requests, limit is 5
        [null, 1],
      ],
    });

    const result = await checkRateLimit(redis, 'rl:user:123', defaultConfig);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2); // 5 - 3
    expect(result.retryAfterMs).toBe(0);
  });

  it('returns allowed when count equals limit (boundary)', async () => {
    const redis = createMockRedis({
      pipelineResults: [
        [null, 0],
        [null, 1],
        [null, 5], // zcard: exactly at limit
        [null, 1],
      ],
    });

    const result = await checkRateLimit(redis, 'rl:user:123', defaultConfig);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('returns not allowed when count exceeds limit', async () => {
    const now = Date.now();
    const oldestTimestamp = now - 30_000; // 30 seconds ago

    const redis = createMockRedis({
      pipelineResults: [
        [null, 0],
        [null, 1],
        [null, 6], // zcard: 6 requests, limit is 5
        [null, 1],
      ],
      zrangeResult: [
        'oldest-member',
        String(oldestTimestamp),
      ],
    });

    const result = await checkRateLimit(redis, 'rl:user:123', defaultConfig);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('executes pipeline commands in correct order', async () => {
    const redis = createMockRedis();

    await checkRateLimit(redis, 'rl:ip:1.2.3.4', defaultConfig);

    expect(redis.pipeline).toHaveBeenCalledOnce();
    const pipeline = redis._pipeline;
    expect(pipeline.zremrangebyscore).toHaveBeenCalledWith(
      'rl:ip:1.2.3.4',
      0,
      expect.any(Number)
    );
    expect(pipeline.zadd).toHaveBeenCalledWith(
      'rl:ip:1.2.3.4',
      expect.any(Number),
      expect.any(String)
    );
    expect(pipeline.zcard).toHaveBeenCalledWith('rl:ip:1.2.3.4');
    expect(pipeline.expire).toHaveBeenCalledWith(
      'rl:ip:1.2.3.4',
      Math.ceil(defaultConfig.windowMs / 1000)
    );
    expect(pipeline.exec).toHaveBeenCalledOnce();
  });

  it('fails open when pipeline throws an error', async () => {
    const redis = createMockRedis();
    redis._pipeline.exec.mockRejectedValue(new Error('Redis connection lost'));

    const result = await checkRateLimit(redis, 'rl:user:123', defaultConfig);

    expect(result).toEqual({
      allowed: true,
      remaining: defaultConfig.maxRequests,
      retryAfterMs: 0,
    });
  });

  it('calculates retryAfterMs from oldest entry timestamp', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const oldestTimestamp = now - 20_000; // 20 seconds ago

    const redis = createMockRedis({
      pipelineResults: [
        [null, 0],
        [null, 1],
        [null, 10], // over limit
        [null, 1],
      ],
      zrangeResult: ['member', String(oldestTimestamp)],
    });

    const result = await checkRateLimit(redis, 'rl:user:123', defaultConfig);

    expect(result.allowed).toBe(false);
    // retryAfterMs = oldestTimestamp + windowMs - now = (now - 20000) + 60000 - now = 40000
    expect(result.retryAfterMs).toBe(40_000);
  });

  it('does not call zrange when request is allowed', async () => {
    const redis = createMockRedis({
      pipelineResults: [
        [null, 0],
        [null, 1],
        [null, 2], // within limit
        [null, 1],
      ],
    });

    await checkRateLimit(redis, 'rl:user:123', defaultConfig);

    expect(redis.zrange).not.toHaveBeenCalled();
  });

  it('handles null pipeline results gracefully', async () => {
    const redis = createMockRedis({
      pipelineResults: [
        [null, 0],
        [null, 1],
        [null, null], // zcard returns null
        [null, 1],
      ],
    });

    const result = await checkRateLimit(redis, 'rl:user:123', defaultConfig);

    // count is 0 when null, so 0 <= 5, allowed
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
  });
});
