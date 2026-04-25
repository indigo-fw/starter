/**
 * CMS link cache + cross-instance invalidation.
 *
 * Split from `cms-link.ts` so the custom Bun server (`server.ts`) and the
 * Next.js server bundle can both import this without tripping the
 * `'server-only'` package guard. That package only exports an empty module
 * under the `react-server` export condition; runtimes outside Next.js
 * webpack (e.g. Bun running our entry directly) hit the package's
 * fallback `index.js`, which throws.
 *
 * `cms-link.ts` keeps `'server-only'` for the DB resolver code (the part
 * that actually matters to keep out of client bundles). This file holds
 * the cross-cutting cache + Redis pub/sub state and is consumed by both
 * Next.js server bundles AND the `instrumentation.ts` startup hook.
 *
 * Runtime guard below catches any client bundle that accidentally pulls
 * this in.
 */
import { getScopedKey } from '@/core/lib/infra/scope';
import type { CmsLinkRef, ResolvedCmsLink } from './cms-link-shared';

// Allow Node/Bun (server.ts, instrumentation.ts, Next.js bundle) AND test
// runners (jsdom defines window but is hosted by Node, so process.versions.node
// is set). Block REAL browsers — no `process.versions.node` there even with
// webpack's `process` shim (which only sets `{ env, browser }`).
if (
  typeof window !== 'undefined' &&
  (typeof process === 'undefined' || !process.versions?.node)
) {
  throw new Error(
    'cms-link-sync.ts is server-only — do not import from client code',
  );
}

// ─── LRU Cache ──────────────────────────────────────────────────────────────
//
// Server-side cache, deduplicates DB queries across users.
// React Query handles per-user/session caching on the client.
// Redis pub/sub (below) invalidates this LRU across server processes.

const CACHE_MAX = 500;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  data: ResolvedCmsLink | null;
  ts: number;
}

const _cache = new Map<string, CacheEntry>();

export function cacheKey(ref: CmsLinkRef, locale: string): string {
  return getScopedKey(
    `${ref.id ?? ''}|${ref.slug ?? ''}|${ref.type ?? ''}|${locale}|${ref.lang ?? ''}`,
  );
}

export function getCached(
  key: string,
): ResolvedCmsLink | null | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) {
    _cache.delete(key);
    return undefined;
  }
  // Move to end for LRU ordering
  _cache.delete(key);
  _cache.set(key, entry);
  return entry.data;
}

export function setCache(key: string, data: ResolvedCmsLink | null): void {
  if (_cache.size >= CACHE_MAX) {
    const oldest = _cache.keys().next().value;
    if (oldest !== undefined) _cache.delete(oldest);
  }
  _cache.set(key, { data, ts: Date.now() });
}

/**
 * Clear the link resolution cache.
 *
 * Always clears the entire cache — targeted invalidation by ID is impossible
 * because slug-based entries can't be reverse-mapped to post IDs without
 * re-querying the DB. The 1-hour TTL + full clear on content save is
 * sufficient for correctness.
 */
export function invalidateCmsLinkCache(): void {
  _cache.clear();
}

// ─── Cross-instance invalidation via Redis pub/sub ──────────────────────────

const INVALIDATION_CHANNEL = 'cms-link:invalidate';
let _publisher: import('ioredis').default | null | undefined;

/** Initialize cross-instance cache invalidation. Call once at server startup. */
export async function initCmsLinkSync(): Promise<void> {
  try {
    const { getPublisher, getSubscriber } = await import(
      '@/core/lib/infra/redis'
    );
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
}

/** Invalidate cache locally + broadcast to other instances. */
export function broadcastCmsLinkInvalidation(): void {
  _cache.clear();
  if (_publisher) {
    _publisher.publish(INVALIDATION_CHANNEL, '1').catch(() => {});
  }
}
