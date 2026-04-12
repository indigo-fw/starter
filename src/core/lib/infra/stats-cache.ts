import { createLogger } from '@/core/lib/infra/logger';
import { getScopedKey } from '@/core/lib/infra/scope';

const log = createLogger('stats-cache');

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Get cached stats or fetch fresh data. Process-local TTL Map.
 */
export async function getStats<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds = 300
): Promise<T> {
  key = getScopedKey(key);
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > Date.now()) {
    return existing.data;
  }

  try {
    const data = await fetchFn();
    cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
    return data;
  } catch (err) {
    log.error('Stats fetch failed', { key, error: String(err) });
    // Return stale data if available
    if (existing) return existing.data;
    throw err;
  }
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
