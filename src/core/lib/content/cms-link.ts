/**
 * CMS Link Protocol — server-side resolver.
 *
 * Resolves `cms://` URIs to real URLs by querying the database.
 * This file is SERVER-ONLY — it imports DB and Drizzle.
 * Client code should import from `cms-link-shared.ts` instead.
 *
 * @see cms-link-shared.ts for types, parser, config, and client-safe utilities.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { cmsPosts } from '@/server/db/schema/cms';
import { cmsCategories } from '@/server/db/schema/categories';
import { cmsPortfolio } from '@/server/db/schema/portfolio';
import { cmsShowcase } from '@/server/db/schema/showcase';
import { cmsTerms } from '@/server/db/schema/terms';
import { ContentStatus } from '@/core/types/cms';
import { DEFAULT_LOCALE } from '@/lib/constants';
import type { Locale } from '@/lib/constants';
import { localePath } from '@/core/lib/i18n/locale';

// Re-export everything from shared so existing server-side imports still work
export {
  type CmsLinkRef,
  type ResolvedCmsLink,
  type CmsLinkConfig,
  configureCmsLinks,
  configureCmsLinksFromContentTypes,
  isStaticRoute,
  isPassthroughHref,
  UUID_RE,
  CMS_URI_RE,
  parseCmsUri,
  getCmsLinkConfig,
} from './cms-link-shared';

import type { CmsLinkRef, ResolvedCmsLink } from './cms-link-shared';
import { getCmsLinkConfig, CMS_URI_RE, parseCmsUri } from './cms-link-shared';

// ─── LRU Cache ──────────────────────────────────────────────────────────────

const CACHE_MAX = 500;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  data: ResolvedCmsLink | null;
  ts: number;
}

const _cache = new Map<string, CacheEntry>();

function cacheKey(ref: CmsLinkRef, locale: string): string {
  return `${ref.id ?? ''}|${ref.slug ?? ''}|${ref.type ?? ''}|${locale}|${ref.lang ?? ''}`;
}

function getCached(key: string): ResolvedCmsLink | null | undefined {
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

function setCache(key: string, data: ResolvedCmsLink | null): void {
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

// Cross-instance invalidation via Redis pub/sub
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

// ─── Internal Types ─────────────────────────────────────────────────────────

interface ContentRecord {
  id: string;
  slug: string;
  lang: string;
  title: string;
  contentTypeId: string;
  translationGroup: string | null;
}

// ─── DB Queries ─────────────────────────────────────────────────────────────

const PUBLISHED = ContentStatus.PUBLISHED;

/** Find content by UUID across all tables. */
async function findById(id: string): Promise<ContentRecord | null> {
  const config = getCmsLinkConfig();
  const [posts, categories, portfolios, showcases, tags] = await Promise.all([
    db
      .select({
        id: cmsPosts.id,
        slug: cmsPosts.slug,
        lang: cmsPosts.lang,
        title: cmsPosts.title,
        type: cmsPosts.type,
        translationGroup: cmsPosts.translationGroup,
      })
      .from(cmsPosts)
      .where(
        and(
          eq(cmsPosts.id, id),
          isNull(cmsPosts.deletedAt),
          eq(cmsPosts.status, PUBLISHED),
        ),
      )
      .limit(1),

    db
      .select({
        id: cmsCategories.id,
        slug: cmsCategories.slug,
        lang: cmsCategories.lang,
        title: cmsCategories.name,
        translationGroup: cmsCategories.translationGroup,
      })
      .from(cmsCategories)
      .where(
        and(
          eq(cmsCategories.id, id),
          isNull(cmsCategories.deletedAt),
          eq(cmsCategories.status, PUBLISHED),
        ),
      )
      .limit(1),

    db
      .select({
        id: cmsPortfolio.id,
        slug: cmsPortfolio.slug,
        lang: cmsPortfolio.lang,
        title: cmsPortfolio.name,
        translationGroup: cmsPortfolio.translationGroup,
      })
      .from(cmsPortfolio)
      .where(
        and(
          eq(cmsPortfolio.id, id),
          isNull(cmsPortfolio.deletedAt),
          eq(cmsPortfolio.status, PUBLISHED),
        ),
      )
      .limit(1),

    db
      .select({
        id: cmsShowcase.id,
        slug: cmsShowcase.slug,
        lang: cmsShowcase.lang,
        title: cmsShowcase.title,
        translationGroup: cmsShowcase.translationGroup,
      })
      .from(cmsShowcase)
      .where(
        and(
          eq(cmsShowcase.id, id),
          isNull(cmsShowcase.deletedAt),
          eq(cmsShowcase.status, PUBLISHED),
        ),
      )
      .limit(1),

    db
      .select({
        id: cmsTerms.id,
        slug: cmsTerms.slug,
        lang: cmsTerms.lang,
        title: cmsTerms.name,
      })
      .from(cmsTerms)
      .where(
        and(
          eq(cmsTerms.id, id),
          isNull(cmsTerms.deletedAt),
          eq(cmsTerms.taxonomyId, 'tag'),
          eq(cmsTerms.status, PUBLISHED),
        ),
      )
      .limit(1),
  ]);

  if (posts[0]) {
    const p = posts[0];
    return {
      id: p.id,
      slug: p.slug,
      lang: p.lang,
      title: p.title,
      contentTypeId: config.postTypeMap[p.type] ?? 'page',
      translationGroup: p.translationGroup,
    };
  }
  if (categories[0]) {
    const c = categories[0];
    return { ...c, contentTypeId: 'category' };
  }
  if (portfolios[0]) {
    const p = portfolios[0];
    return { ...p, contentTypeId: 'portfolio' };
  }
  if (showcases[0]) {
    const s = showcases[0];
    return { ...s, contentTypeId: 'showcase' };
  }
  if (tags[0]) {
    const t = tags[0];
    return { ...t, contentTypeId: 'tag', translationGroup: null };
  }
  return null;
}

/**
 * Find content by slug, searching in priority order: page > blog > category > portfolio > showcase > tag.
 * Optionally constrain to a specific locale and/or content type.
 */
async function findBySlugInLocale(
  slug: string,
  locale?: string,
  type?: string,
): Promise<ContentRecord | null> {
  if (type) {
    return findBySlugInTable(slug, type, locale);
  }

  const config = getCmsLinkConfig();
  const [posts, categories, portfolios, showcases, tags] = await Promise.all([
    db
      .select({
        id: cmsPosts.id,
        slug: cmsPosts.slug,
        lang: cmsPosts.lang,
        title: cmsPosts.title,
        type: cmsPosts.type,
        translationGroup: cmsPosts.translationGroup,
      })
      .from(cmsPosts)
      .where(
        and(
          eq(cmsPosts.slug, slug),
          isNull(cmsPosts.deletedAt),
          eq(cmsPosts.status, PUBLISHED),
          ...(locale ? [eq(cmsPosts.lang, locale)] : []),
        ),
      )
      .limit(5),

    db
      .select({
        id: cmsCategories.id,
        slug: cmsCategories.slug,
        lang: cmsCategories.lang,
        title: cmsCategories.name,
        translationGroup: cmsCategories.translationGroup,
      })
      .from(cmsCategories)
      .where(
        and(
          eq(cmsCategories.slug, slug),
          isNull(cmsCategories.deletedAt),
          eq(cmsCategories.status, PUBLISHED),
          ...(locale ? [eq(cmsCategories.lang, locale)] : []),
        ),
      )
      .limit(1),

    db
      .select({
        id: cmsPortfolio.id,
        slug: cmsPortfolio.slug,
        lang: cmsPortfolio.lang,
        title: cmsPortfolio.name,
        translationGroup: cmsPortfolio.translationGroup,
      })
      .from(cmsPortfolio)
      .where(
        and(
          eq(cmsPortfolio.slug, slug),
          isNull(cmsPortfolio.deletedAt),
          eq(cmsPortfolio.status, PUBLISHED),
          ...(locale ? [eq(cmsPortfolio.lang, locale)] : []),
        ),
      )
      .limit(1),

    db
      .select({
        id: cmsShowcase.id,
        slug: cmsShowcase.slug,
        lang: cmsShowcase.lang,
        title: cmsShowcase.title,
        translationGroup: cmsShowcase.translationGroup,
      })
      .from(cmsShowcase)
      .where(
        and(
          eq(cmsShowcase.slug, slug),
          isNull(cmsShowcase.deletedAt),
          eq(cmsShowcase.status, PUBLISHED),
          ...(locale ? [eq(cmsShowcase.lang, locale)] : []),
        ),
      )
      .limit(1),

    db
      .select({
        id: cmsTerms.id,
        slug: cmsTerms.slug,
        lang: cmsTerms.lang,
        title: cmsTerms.name,
      })
      .from(cmsTerms)
      .where(
        and(
          eq(cmsTerms.slug, slug),
          isNull(cmsTerms.deletedAt),
          eq(cmsTerms.taxonomyId, 'tag'),
          eq(cmsTerms.status, PUBLISHED),
          ...(locale ? [eq(cmsTerms.lang, locale)] : []),
        ),
      )
      .limit(1),
  ]);

  if (posts.length) {
    const page = posts.find((p) => config.postTypeMap[p.type] === 'page');
    const pick = page ?? posts[0];
    return {
      id: pick.id,
      slug: pick.slug,
      lang: pick.lang,
      title: pick.title,
      contentTypeId: config.postTypeMap[pick.type] ?? 'page',
      translationGroup: pick.translationGroup,
    };
  }
  if (categories[0]) {
    const c = categories[0];
    return { ...c, contentTypeId: 'category' };
  }
  if (portfolios[0]) {
    const p = portfolios[0];
    return { ...p, contentTypeId: 'portfolio' };
  }
  if (showcases[0]) {
    const s = showcases[0];
    return { ...s, contentTypeId: 'showcase' };
  }
  if (tags[0]) {
    const t = tags[0];
    return { ...t, contentTypeId: 'tag', translationGroup: null };
  }
  return null;
}

/** Find by slug in a specific content type table. */
async function findBySlugInTable(
  slug: string,
  type: string,
  locale?: string,
): Promise<ContentRecord | null> {
  const config = getCmsLinkConfig();
  switch (type) {
    case 'page':
    case 'blog': {
      const postType = Object.entries(config.postTypeMap).find(
        ([, id]) => id === type,
      )?.[0];
      const rows = await db
        .select({
          id: cmsPosts.id,
          slug: cmsPosts.slug,
          lang: cmsPosts.lang,
          title: cmsPosts.title,
          type: cmsPosts.type,
          translationGroup: cmsPosts.translationGroup,
        })
        .from(cmsPosts)
        .where(
          and(
            eq(cmsPosts.slug, slug),
            isNull(cmsPosts.deletedAt),
            eq(cmsPosts.status, PUBLISHED),
            ...(postType ? [eq(cmsPosts.type, Number(postType))] : []),
            ...(locale ? [eq(cmsPosts.lang, locale)] : []),
          ),
        )
        .limit(1);
      if (!rows[0]) return null;
      const p = rows[0];
      return {
        id: p.id,
        slug: p.slug,
        lang: p.lang,
        title: p.title,
        contentTypeId: type,
        translationGroup: p.translationGroup,
      };
    }
    case 'category': {
      const rows = await db
        .select({
          id: cmsCategories.id,
          slug: cmsCategories.slug,
          lang: cmsCategories.lang,
          title: cmsCategories.name,
          translationGroup: cmsCategories.translationGroup,
        })
        .from(cmsCategories)
        .where(
          and(
            eq(cmsCategories.slug, slug),
            isNull(cmsCategories.deletedAt),
            eq(cmsCategories.status, PUBLISHED),
            ...(locale ? [eq(cmsCategories.lang, locale)] : []),
          ),
        )
        .limit(1);
      if (!rows[0]) return null;
      return { ...rows[0], contentTypeId: 'category' };
    }
    case 'portfolio': {
      const rows = await db
        .select({
          id: cmsPortfolio.id,
          slug: cmsPortfolio.slug,
          lang: cmsPortfolio.lang,
          title: cmsPortfolio.name,
          translationGroup: cmsPortfolio.translationGroup,
        })
        .from(cmsPortfolio)
        .where(
          and(
            eq(cmsPortfolio.slug, slug),
            isNull(cmsPortfolio.deletedAt),
            eq(cmsPortfolio.status, PUBLISHED),
            ...(locale ? [eq(cmsPortfolio.lang, locale)] : []),
          ),
        )
        .limit(1);
      if (!rows[0]) return null;
      return { ...rows[0], contentTypeId: 'portfolio' };
    }
    case 'showcase': {
      const rows = await db
        .select({
          id: cmsShowcase.id,
          slug: cmsShowcase.slug,
          lang: cmsShowcase.lang,
          title: cmsShowcase.title,
          translationGroup: cmsShowcase.translationGroup,
        })
        .from(cmsShowcase)
        .where(
          and(
            eq(cmsShowcase.slug, slug),
            isNull(cmsShowcase.deletedAt),
            eq(cmsShowcase.status, PUBLISHED),
            ...(locale ? [eq(cmsShowcase.lang, locale)] : []),
          ),
        )
        .limit(1);
      if (!rows[0]) return null;
      return { ...rows[0], contentTypeId: 'showcase' };
    }
    case 'tag': {
      const rows = await db
        .select({
          id: cmsTerms.id,
          slug: cmsTerms.slug,
          lang: cmsTerms.lang,
          title: cmsTerms.name,
        })
        .from(cmsTerms)
        .where(
          and(
            eq(cmsTerms.slug, slug),
            isNull(cmsTerms.deletedAt),
            eq(cmsTerms.taxonomyId, 'tag'),
            eq(cmsTerms.status, PUBLISHED),
            ...(locale ? [eq(cmsTerms.lang, locale)] : []),
          ),
        )
        .limit(1);
      if (!rows[0]) return null;
      return { ...rows[0], contentTypeId: 'tag', translationGroup: null };
    }
    default:
      return null;
  }
}

/** Find a translation sibling in the same translation group. */
async function findSibling(
  translationGroup: string,
  targetLocale: string,
  contentTypeId: string,
): Promise<ContentRecord | null> {
  const config = getCmsLinkConfig();
  switch (contentTypeId) {
    case 'page':
    case 'blog': {
      const postType = Object.entries(config.postTypeMap).find(
        ([, id]) => id === contentTypeId,
      )?.[0];
      const rows = await db
        .select({
          id: cmsPosts.id,
          slug: cmsPosts.slug,
          lang: cmsPosts.lang,
          title: cmsPosts.title,
          translationGroup: cmsPosts.translationGroup,
        })
        .from(cmsPosts)
        .where(
          and(
            eq(cmsPosts.translationGroup, translationGroup),
            eq(cmsPosts.lang, targetLocale),
            isNull(cmsPosts.deletedAt),
            eq(cmsPosts.status, PUBLISHED),
            ...(postType ? [eq(cmsPosts.type, Number(postType))] : []),
          ),
        )
        .limit(1);
      if (!rows[0]) return null;
      return { ...rows[0], contentTypeId };
    }
    case 'category': {
      const rows = await db
        .select({
          id: cmsCategories.id,
          slug: cmsCategories.slug,
          lang: cmsCategories.lang,
          title: cmsCategories.name,
          translationGroup: cmsCategories.translationGroup,
        })
        .from(cmsCategories)
        .where(
          and(
            eq(cmsCategories.translationGroup, translationGroup),
            eq(cmsCategories.lang, targetLocale),
            isNull(cmsCategories.deletedAt),
            eq(cmsCategories.status, PUBLISHED),
          ),
        )
        .limit(1);
      if (!rows[0]) return null;
      return { ...rows[0], contentTypeId: 'category' };
    }
    case 'portfolio': {
      const rows = await db
        .select({
          id: cmsPortfolio.id,
          slug: cmsPortfolio.slug,
          lang: cmsPortfolio.lang,
          title: cmsPortfolio.name,
          translationGroup: cmsPortfolio.translationGroup,
        })
        .from(cmsPortfolio)
        .where(
          and(
            eq(cmsPortfolio.translationGroup, translationGroup),
            eq(cmsPortfolio.lang, targetLocale),
            isNull(cmsPortfolio.deletedAt),
            eq(cmsPortfolio.status, PUBLISHED),
          ),
        )
        .limit(1);
      if (!rows[0]) return null;
      return { ...rows[0], contentTypeId: 'portfolio' };
    }
    case 'showcase': {
      const rows = await db
        .select({
          id: cmsShowcase.id,
          slug: cmsShowcase.slug,
          lang: cmsShowcase.lang,
          title: cmsShowcase.title,
          translationGroup: cmsShowcase.translationGroup,
        })
        .from(cmsShowcase)
        .where(
          and(
            eq(cmsShowcase.translationGroup, translationGroup),
            eq(cmsShowcase.lang, targetLocale),
            isNull(cmsShowcase.deletedAt),
            eq(cmsShowcase.status, PUBLISHED),
          ),
        )
        .limit(1);
      if (!rows[0]) return null;
      return { ...rows[0], contentTypeId: 'showcase' };
    }
    default:
      return null;
  }
}

// ─── URL Building ───────────────────────────────────────────────────────────

function buildContentUrl(
  contentTypeId: string,
  slug: string,
  locale: string,
  fragment?: string,
): string {
  const config = getCmsLinkConfig();
  const prefix = config.urlPrefixes[contentTypeId] ?? '/';
  const path = prefix === '/' ? `/${slug}` : `${prefix}${slug}`;
  const url = localePath(path, locale as Locale);
  return fragment ? `${url}#${fragment}` : url;
}

// ─── Core Resolver ──────────────────────────────────────────────────────────

/**
 * Resolve a CMS link reference to a real URL.
 *
 * @param ref  Parsed reference (from parseCmsUri or manual construction)
 * @param currentLocale  The visitor's current page locale
 * @returns Resolved link with href, title, and locale — or null if not found
 */
export async function resolveCmsLink(
  ref: CmsLinkRef,
  currentLocale: string,
): Promise<ResolvedCmsLink | null> {
  const key = cacheKey(ref, currentLocale);
  const cached = getCached(key);
  if (cached !== undefined) return cached;

  try {
    const result = await resolveUncached(ref, currentLocale);
    setCache(key, result);
    return result;
  } catch {
    // DB not available (build time, etc.) — don't cache the failure
    return null;
  }
}

async function resolveUncached(
  ref: CmsLinkRef,
  currentLocale: string,
): Promise<ResolvedCmsLink | null> {
  const targetLocale = ref.lang ?? currentLocale;

  let record: ContentRecord | null = null;

  if (ref.id) {
    record = await findById(ref.id);
  } else if (ref.slug) {
    const cleanSlug = ref.slug.replace(/^\//, '');

    record = await findBySlugInLocale(cleanSlug, currentLocale, ref.type);

    if (!record && currentLocale !== DEFAULT_LOCALE) {
      record = await findBySlugInLocale(cleanSlug, DEFAULT_LOCALE, ref.type);
    }

    if (!record) {
      record = await findBySlugInLocale(cleanSlug, undefined, ref.type);
    }
  }

  if (!record) return null;

  if (record.lang !== targetLocale && record.translationGroup) {
    const sibling = await findSibling(
      record.translationGroup,
      targetLocale,
      record.contentTypeId,
    );
    if (sibling) {
      record = sibling;
    }
  }

  return {
    href: buildContentUrl(
      record.contentTypeId,
      record.slug,
      record.lang,
      ref.fragment,
    ),
    title: record.title,
    locale: record.lang,
  };
}

// ─── Batch Text Resolver ────────────────────────────────────────────────────

/**
 * Resolve all `cms://` URIs in a text string to real URLs.
 * Fast path: returns text unchanged if no `cms://` present.
 */
export async function resolveCmsLinks(
  text: string,
  locale: string,
): Promise<string> {
  if (!text.includes('cms://')) return text;

  const matches = [...text.matchAll(CMS_URI_RE)];
  if (!matches.length) return text;

  const unique = new Map<string, CmsLinkRef>();
  for (const m of matches) {
    if (!unique.has(m[0])) {
      const ref = parseCmsUri(m[0]);
      if (ref) unique.set(m[0], ref);
    }
  }

  const resolved = new Map<string, string>();
  await Promise.all(
    [...unique.entries()].map(async ([uri, ref]) => {
      const link = await resolveCmsLink(ref, locale);
      if (link) resolved.set(uri, link.href);
    }),
  );

  let result = text;
  for (const [uri, href] of resolved) {
    result = result.replaceAll(uri, href);
  }
  return result;
}

/**
 * Resolve `cms://` URIs in all string fields of an object (shallow).
 * Returns a new object with resolved values. Non-string fields pass through.
 */
export async function resolveRecordCmsLinks<
  T extends Record<string, unknown>,
>(record: T, locale: string): Promise<T> {
  let hasCmsLinks = false;
  for (const val of Object.values(record)) {
    if (typeof val === 'string' && val.includes('cms://')) {
      hasCmsLinks = true;
      break;
    }
  }
  if (!hasCmsLinks) return record;

  const resolved = { ...record };
  for (const [key, val] of Object.entries(resolved)) {
    if (typeof val === 'string' && val.includes('cms://')) {
      (resolved as Record<string, unknown>)[key] = await resolveCmsLinks(
        val,
        locale,
      );
    }
  }
  return resolved;
}
