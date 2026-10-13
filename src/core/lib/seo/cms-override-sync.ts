/**
 * Coded-route CMS override cache + cross-instance invalidation.
 *
 * Split from `cms-override.ts` for the same reason `cms-link-sync.ts` is split
 * from `cms-link.ts`: the custom Bun server (`server.ts`) loads the
 * scheduled-publish worker directly, outside Next.js webpack, where the
 * `'server-only'` package guard throws. `cms-override.ts` keeps `'server-only'`
 * (and the React `cache()` + next-intl bits) for the DB lookup; this file holds
 * only the LRU + Redis pub/sub state, so both the Next.js server bundle and the
 * Bun entry can import it.
 *
 * Note on instances: a Bun-entry import of this module is a SEPARATE module
 * instance from the one Next.js bundles for SSR. Clearing the local map from a
 * worker therefore only matters for that worker; what reaches the SSR cache is
 * the Redis broadcast. Without Redis the TTLs bound staleness.
 */
import type { CmsOverride } from './cms-override';

import { registerMemoryStat } from '@/core/lib/infra/memory-stats';

// Allow Node/Bun (server.ts, instrumentation.ts, Next.js bundle) AND test
// runners (jsdom defines window but is hosted by Node). Block real browsers.
if (
  typeof window !== 'undefined' &&
  (typeof process === 'undefined' || !process.versions?.node)
) {
  throw new Error(
    'cms-override-sync.ts is server-only — do not import from client code'
  );
}

// ─── Cache ──────────────────────────────────────────────────────────────────
//
// Every coded public route (home, blog, pricing, …) asks for its override on
// every view, and all those pages are dynamic — so without this each view is
// one DB round-trip that almost always answers "nothing here". Misses are the
// common case and are cached longest; hits carry editable content and expire
// sooner. Both are cleared on every admin post mutation (local + Redis), so
// the TTLs only bound staleness for instances that missed the broadcast.

const HIT_TTL_MS = 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;

interface CacheEntry {
  data: CmsOverride | null;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();
registerMemoryStat('cmsOverrideCache', () => _cache.size);

export function readCache(key: string): CmsOverride | null | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    _cache.delete(key);
    return undefined;
  }
  // Re-insert so Map order doubles as LRU order
  _cache.delete(key);
  _cache.set(key, entry);
  return entry.data;
}

export function writeCache(key: string, data: CmsOverride | null): void {
  if (_cache.size >= CACHE_MAX) {
    const oldest = _cache.keys().next().value;
    if (oldest !== undefined) _cache.delete(oldest);
  }
  const ttl = data ? HIT_TTL_MS : MISS_TTL_MS;
  _cache.set(key, { data, expiresAt: Date.now() + ttl });
}

// ─── Cross-instance invalidation ───────────────────────────────────────────

const INVALIDATION_CHANNEL = 'cms-override:invalidate';
let _publisher: import('ioredis').default | null | undefined;
let _syncInit: Promise<void> | undefined;

/**
 * Subscribe this process to override invalidations from other instances.
 * Memoized and self-wiring: the first lookup or invalidation calls it, so no
 * startup hook has to remember to — the cache and its subscriber must live in
 * the same module graph anyway. No-op without Redis (local invalidation only).
 */
export function initCmsOverrideSync(): Promise<void> {
  _syncInit ??= (async () => {
    try {
      const { getPublisher, getSubscriber } =
        await import('@/core/lib/infra/redis');
      _publisher = getPublisher();
      const sub = getSubscriber();
      if (!sub) return;
      await sub.subscribe(INVALIDATION_CHANNEL);
      sub.on('message', (channel: string) => {
        if (channel === INVALIDATION_CHANNEL) _cache.clear();
      });
    } catch {
      // Redis not available — local invalidation only
    }
  })();
  return _syncInit;
}

/**
 * Drop every cached override, here and on every other instance.
 * Call from any mutation that can change which page is published under a
 * coded route's slug — the whole cache goes because an entry can't be mapped
 * back from slug to post without the query we're trying to avoid.
 */
export function invalidateCmsOverrideCache(): void {
  _cache.clear();
  // Fire-and-forget; init is memoized so this normally costs one resolved promise.
  initCmsOverrideSync()
    .then(() => _publisher?.publish(INVALIDATION_CHANNEL, '1'))
    .catch(() => {});
}
