/**
 * Edge rate limiting — in-memory sliding window with optional Redis upgrade.
 *
 * Used by the Next.js proxy to rate-limit auth/API endpoints before tRPC.
 * Redis is preferred (multi-instance safe); falls back to in-memory Map.
 * Fail-open: always returns `allowed: true` on errors.
 */

// ─── In-memory fallback (single-instance only) ──────────────────────────────

const ipHits = new Map<string, { count: number; resetAt: number }>();
let lastCleanup = Date.now();

export function memoryRateLimit(
  ip: string,
  windowMs: number,
  maxRequests: number,
  now = Date.now(),
): boolean {
  // Periodic cleanup (every 5 minutes)
  if (now - lastCleanup > 300_000) {
    lastCleanup = now;
    for (const [key, val] of ipHits) {
      if (val.resetAt < now) ipHits.delete(key);
    }
  }

  const entry = ipHits.get(ip);
  if (!entry || entry.resetAt < now) {
    ipHits.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= maxRequests;
}

/** Clear all tracked IPs (for testing) */
export function resetMemoryRateLimit(): void {
  ipHits.clear();
  lastCleanup = Date.now();
}

// ─── Redis-backed rate limit (multi-instance safe) ──────────────────────────

let redisAvailable: boolean | null = null;

export async function edgeRateLimit(
  ip: string,
  windowMs: number,
  maxRequests: number,
): Promise<boolean> {
  // Skip Redis attempt if we already know it's unavailable
  if (redisAvailable === false) {
    return memoryRateLimit(ip, windowMs, maxRequests);
  }

  try {
    const { getRedis } = await import('@/core/lib/infra/redis');
    const { checkRateLimit } = await import('@/core/lib/infra/rate-limit');
    const redis = getRedis();
    if (!redis) {
      redisAvailable = false;
      return memoryRateLimit(ip, windowMs, maxRequests);
    }
    redisAvailable = true;
    const result = await checkRateLimit(redis, `rl:proxy:${ip}`, { windowMs, maxRequests });
    return result.allowed;
  } catch {
    redisAvailable = false;
    return memoryRateLimit(ip, windowMs, maxRequests);
  }
}

/** Reset Redis availability flag (for testing) */
export function resetRedisAvailability(): void {
  redisAvailable = null;
}
