/**
 * Edge rate limiting — in-memory sliding window with optional Redis upgrade.
 *
 * Used by the Next.js proxy to rate-limit auth/API endpoints before tRPC.
 * Redis is preferred (multi-instance safe); falls back to in-memory Map.
 * Fail-open: always returns `allowed: true` on errors.
 */
import { registerMemoryStat } from '@/core/lib/infra/memory-stats';

// ─── In-memory fallback (single-instance only) ──────────────────────────────

/**
 * Hard cap on tracked IPs. The 5-minute sweep alone is not a bound: a
 * client rotating spoofed addresses can insert far faster than the sweep
 * drains, and each entry lives for a full window. Beyond the cap the oldest
 * entry is evicted — the limiter degrades to "forgets early" under flood,
 * never to unbounded growth.
 */
const MAX_TRACKED_IPS = 10_000;

const ipHits = new Map<string, { count: number; resetAt: number }>();
let lastCleanup = Date.now();

registerMemoryStat('edgeRateLimitIps', () => ipHits.size);

function sweepExpired(now: number): void {
  for (const [key, val] of ipHits) {
    if (val.resetAt < now) ipHits.delete(key);
  }
}

/** Make room for one more entry: drop expired ones first, then the oldest. */
function evictForInsert(now: number): void {
  if (ipHits.size < MAX_TRACKED_IPS) return;
  sweepExpired(now);
  // Map iterates in insertion order, so the first key is the oldest entry.
  while (ipHits.size >= MAX_TRACKED_IPS) {
    const oldest = ipHits.keys().next();
    if (oldest.done) break;
    ipHits.delete(oldest.value);
  }
}

export function memoryRateLimit(
  ip: string,
  windowMs: number,
  maxRequests: number,
  now = Date.now()
): boolean {
  // Periodic cleanup (every 5 minutes)
  if (now - lastCleanup > 300_000) {
    lastCleanup = now;
    sweepExpired(now);
  }

  const entry = ipHits.get(ip);
  if (!entry || entry.resetAt < now) {
    if (!entry) evictForInsert(now);
    ipHits.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= maxRequests;
}

/** Number of IPs currently tracked by the in-memory fallback (for testing). */
export function memoryRateLimitSize(): number {
  return ipHits.size;
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
  maxRequests: number
): Promise<boolean> {
  // Skip Redis attempt if we already know it's unavailable
  if (redisAvailable === false) {
    return memoryRateLimit(ip, windowMs, maxRequests);
  }

  try {
    const { getRequestRedis } = await import('@/core/lib/infra/redis');
    const { checkRateLimit } = await import('@/core/lib/infra/rate-limit');
    const redis = getRequestRedis();
    if (!redis) {
      redisAvailable = false;
      return memoryRateLimit(ip, windowMs, maxRequests);
    }
    redisAvailable = true;
    const result = await checkRateLimit(redis, `rl:proxy:${ip}`, {
      windowMs,
      maxRequests,
    });
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
