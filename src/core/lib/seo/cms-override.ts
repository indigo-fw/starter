import { cache } from 'react';

import 'server-only';

import { publishedPageWhere } from '@/core/crud/page-seo';
import { getLocale } from '@/core/lib/i18n/locale-server';
import { registerMemoryStat } from '@/core/lib/infra/memory-stats';
import { getScopedKey } from '@/core/lib/infra/scope';
import type { DbClient } from '@/server/db';
import { db } from '@/server/db';
import { cmsPosts } from '@/server/db/schema/cms';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CmsOverrideSEO {
  seoTitle: string | null;
  metaDescription: string | null;
  noindex: boolean;
  jsonLd: string | null;
}

export interface CmsOverride {
  seo: CmsOverrideSEO;
  content: string | null;
}

// ─── Process cache ──────────────────────────────────────────────────────────
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

function readCache(key: string): CmsOverride | null | undefined {
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

function writeCache(key: string, data: CmsOverride | null): void {
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

// ─── Core fetch (accepts explicit db + locale) ─────────────────────────────

async function fetchOverride(
  database: DbClient,
  slug: string,
  lang: string
): Promise<CmsOverride | null> {
  const [post] = await database
    .select({
      seoTitle: cmsPosts.seoTitle,
      metaDescription: cmsPosts.metaDescription,
      noindex: cmsPosts.noindex,
      jsonLd: cmsPosts.jsonLd,
      content: cmsPosts.content,
    })
    .from(cmsPosts)
    .where(publishedPageWhere(slug, lang))
    .limit(1);

  if (!post) return null;

  const { content, ...seo } = post;
  return { seo, content: content || null };
}

/**
 * Fetch CMS page override for a coded route.
 *
 * Two cache layers: `React.cache()` deduplicates within one request (so
 * generateMetadata() and the page share a lookup), and the process cache
 * above spans requests. A DB failure is not cached — the caller's catch
 * decides, and the next view retries.
 *
 * @param database  Drizzle DB client
 * @param slug      Route slug (e.g. 'blog', 'portfolio', '' for homepage)
 * @param lang      Content language
 */
export const getCmsOverride = cache(
  async (
    database: DbClient,
    slug: string,
    lang: string
  ): Promise<CmsOverride | null> => {
    const key = getScopedKey('cms-override', lang, slug);
    const cached = readCache(key);
    if (cached !== undefined) return cached;

    void initCmsOverrideSync();
    const result = await fetchOverride(database, slug, lang);
    writeCache(key, result);
    return result;
  }
);

// ─── Simplified fetch (auto-resolves db + locale) ──────────────────────────

/**
 * Fetch CMS page override for a coded route — simplified API.
 *
 * Handles db, locale, and error catching internally.
 * Use in generateMetadata() and page components.
 *
 * @example
 * const cms = await getPageCmsOverride('portfolio');
 * // In metadata:
 * title: buildPageTitle({ seoTitle: cms?.seo.seoTitle, ... })
 * // In JSX:
 * <CmsSlotContent slug="portfolio" />
 */
export async function getPageCmsOverride(
  slug: string
): Promise<CmsOverride | null> {
  try {
    const locale = await getLocale();
    return await getCmsOverride(db, slug, locale);
  } catch {
    return null;
  }
}
