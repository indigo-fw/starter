import type IORedis from 'ioredis';

export interface RateLimitConfig {
  /** Sliding window duration in milliseconds (e.g. 60_000 for 1 minute) */
  windowMs: number;
  /** Maximum number of requests allowed within the window */
  maxRequests: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Milliseconds until the client can retry (0 if allowed) */
  retryAfterMs: number;
}

/**
 * Sliding window rate limiter via Redis sorted sets.
 *
 * Each request is stored as a member in a sorted set with the current
 * timestamp as its score. On each check, expired entries outside the
 * window are pruned, the new entry is added, and the cardinality is
 * compared against `maxRequests`.
 *
 * Fail-open: returns `allowed: true` if Redis is unavailable or errors.
 */
export async function checkRateLimit(
  redis: IORedis | null,
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  if (!redis) {
    return { allowed: true, remaining: config.maxRequests, retryAfterMs: 0 };
  }

  const now = Date.now();
  const windowStart = now - config.windowMs;
  const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

  try {
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now, member);
    pipeline.zcard(key);
    pipeline.expire(key, Math.ceil(config.windowMs / 1000));
    const results = await pipeline.exec();

    const count = (results?.[2]?.[1] as number) ?? 0;
    const allowed = count <= config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - count);

    let retryAfterMs = 0;
    if (!allowed) {
      // Find the oldest entry to calculate when the window slides enough
      const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
      if (oldest.length >= 2) {
        retryAfterMs = Math.max(0, parseInt(oldest[1]!) + config.windowMs - now);
      }
    }

    return { allowed, remaining, retryAfterMs };
  } catch {
    // Fail-open on Redis errors
    return { allowed: true, remaining: config.maxRequests, retryAfterMs: 0 };
  }
}
