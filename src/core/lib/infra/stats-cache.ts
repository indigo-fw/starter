import { createLogger } from '@/core/lib/infra/logger';
import { registerMemoryStat } from '@/core/lib/infra/memory-stats';
import { getScopedKey } from '@/core/lib/infra/scope';

const log = createLogger('stats-cache');

// Size bound on top of the TTL: keys can include per-slug×locale content, so
// a crawler walking the long tail can pile up hundreds of entries within one
// TTL window in a long-running server. LRU-evict beyond this.
const MAX_ENTRIES = 500;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
// Concurrent misses for the same key share one fetch instead of stampeding.
const inflight = new Map<string, Promise<unknown>>();

registerMemoryStat('statsCache', () => cache.size);

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}, SWEEP_INTERVAL_MS);
if (typeof sweep.unref === 'function') sweep.unref();

function evictOverflow(): void {
  // Map preserves insertion order → the first key is the least recently used
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * Get cached stats or fetch fresh data. Process-local TTL + LRU-bounded Map;
 * concurrent callers for the same key share a single in-flight fetch; on a
 * failed refresh the stale value is returned if one exists.
 */
export async function getStats<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds = 300
): Promise<T> {
  key = getScopedKey(key);
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > Date.now()) {
    // Refresh recency for LRU ordering
    cache.delete(key);
    cache.set(key, existing);
    return existing.data;
  }

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = fetchFn().then(
    (data) => {
      cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
      evictOverflow();
      inflight.delete(key);
      return data;
    },
    (err: unknown) => {
      inflight.delete(key);
      log.error('Stats fetch failed', { key, error: String(err) });
      // Return stale data if available
      if (existing) return existing.data;
      throw err;
    }
  );
  inflight.set(key, promise);
  return promise;
}

/** Invalidate all cache keys matching a prefix */
export function invalidateStats(keyPrefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) {
      cache.delete(key);
    }
  }
}

/** Clear the entire stats cache */
export function clearStatsCache(): void {
  cache.clear();
}
