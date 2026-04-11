/**
 * CMS Link Protocol — resolves `cms://` URIs to real URLs.
 *
 * Protocol syntax:
 *   cms://<identifier>[?lang=xx][&type=xx][#fragment]
 *
 * Where <identifier> is either:
 *   - A UUID → lookup by post/content ID
 *   - A slug string → lookup by slug with locale resolution chain
 *
 * Examples:
 *   cms://3f2a1b4c-def5-6789-abcd-ef0123456789       → by ID, visitor's locale
 *   cms://3f2a1b4c-def5-6789-abcd-ef0123456789?lang=de → by ID, force German
 *   cms://about-us                                     → by slug, visitor's locale
 *   cms://about-us?lang=de                             → by slug, force German
 *   cms://about-us?type=page                           → by slug, disambiguate type
 *   cms://about-us?lang=de&type=page#team              → all options + fragment
 *
 * Slug resolution order:
 *   1. Current locale → found? done
 *   2. Default locale → found? get current-locale sibling → use sibling or default
 *   3. Any locale → same sibling logic
 *   4. Not found → return null
 *
 * Caching: LRU Map with TTL, keyed by ref + target locale.
 * Invalidation: invalidateCmsLinkCache() on content save, via Redis pub/sub.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
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
import type { ContentTypeDeclaration } from '@/core/config/content-types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CmsLinkRef {
  id?: string;
  slug?: string;
  lang?: string;
  type?: string;
  fragment?: string;
}

export interface ResolvedCmsLink {
  href: string;
  title: string;
  locale: string;
}

interface ContentRecord {
  id: string;
  slug: string;
  lang: string;
  title: string;
  contentTypeId: string;
  translationGroup: string | null;
}

// ─── DI Configuration ───────────────────────────────────────────────────────

interface CmsLinkConfig {
  urlPrefixes: Record<string, string>;
  postTypeMap: Record<number, string>;
}

let _config: CmsLinkConfig = { urlPrefixes: {}, postTypeMap: {} };

/** Register content type URL prefixes and post type mapping. */
export function configureCmsLinks(config: CmsLinkConfig): void {
  _config = config;
}

/** Convenience: configure from ContentTypeDeclaration array. */
export function configureCmsLinksFromContentTypes(
  types: readonly ContentTypeDeclaration[],
): void {
  configureCmsLinks({
    urlPrefixes: Object.fromEntries(types.map((ct) => [ct.id, ct.urlPrefix])),
    postTypeMap: Object.fromEntries(
      types
        .filter((ct) => ct.postType != null)
        .map((ct) => [ct.postType!, ct.id]),
    ),
  });
}

// ─── URI Parser ─────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Regex to detect cms:// URIs in a string. */
export const CMS_URI_RE = /cms:\/\/[^\s)"'<>]+/g;

/**
 * Parse a `cms://` URI into a structured reference.
 * Returns null if the URI is invalid or not a cms:// protocol.
 */
export function parseCmsUri(uri: string): CmsLinkRef | null {
  if (!uri.startsWith('cms://')) return null;

  try {
    const url = new URL(uri);
    const identifier = (url.hostname + url.pathname.replace(/^\/$/, ''))
      .toLowerCase();

    if (!identifier) return null;

    const lang = url.searchParams.get('lang') ?? undefined;
    const type = url.searchParams.get('type') ?? undefined;
    const fragment = url.hash ? url.hash.slice(1) : undefined;
    const isId = UUID_RE.test(identifier);

    return {
      ...(isId ? { id: identifier } : { slug: identifier }),
      lang: lang || undefined,
      type: type || undefined,
      fragment: fragment || undefined,
    };
  } catch {
    return null;
  }
}

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

/** Clear cached entries. Pass a postId to invalidate only that post, or omit to clear all. */
export function invalidateCmsLinkCache(postId?: string): void {
  if (!postId) {
    _cache.clear();
    return;
  }
  // Remove any entry whose key contains this ID
  for (const key of _cache.keys()) {
    if (key.includes(postId)) _cache.delete(key);
  }
  // Also invalidate slug-based entries that might reference this post
  // (we can't know which slugs map to this ID without querying, so clear all
  // slug-based entries — they'll repopulate on next request)
  for (const [key] of _cache) {
    if (!key.startsWith(postId)) _cache.delete(key);
  }
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

// ─── DB Queries ─────────────────────────────────────────────────────────────

const PUBLISHED = ContentStatus.PUBLISHED;

/** Find content by UUID across all tables. */
async function findById(id: string): Promise<ContentRecord | null> {
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
      contentTypeId: _config.postTypeMap[p.type] ?? 'page',
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
  const langFilter = locale ? sql` AND lang = ${locale}` : sql``;
  const statusFilter = sql` AND status = ${PUBLISHED} AND deleted_at IS NULL`;

  // If type specified, only query that table
  if (type) {
    return findBySlugInTable(slug, type, locale);
  }

  // Query all tables in parallel, return by priority
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
      .limit(5), // Multiple post types might match

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

  // Priority: pages (type=1) > blog (type=2) > other post types > category > portfolio > showcase > tag
  for (const p of posts) {
    const ctId = _config.postTypeMap[p.type];
    if (ctId === 'page') {
      return {
        id: p.id,
        slug: p.slug,
        lang: p.lang,
        title: p.title,
        contentTypeId: 'page',
        translationGroup: p.translationGroup,
      };
    }
  }
  for (const p of posts) {
    const ctId = _config.postTypeMap[p.type] ?? 'page';
    return {
      id: p.id,
      slug: p.slug,
      lang: p.lang,
      title: p.title,
      contentTypeId: ctId,
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

/** Find by slug in a specific content type table. */
async function findBySlugInTable(
  slug: string,
  type: string,
  locale?: string,
): Promise<ContentRecord | null> {
  const langCond = <T extends { lang: { _: unknown } }>(col: T) =>
    locale ? [eq(col.lang as never, locale)] : [];

  switch (type) {
    case 'page':
    case 'blog': {
      // Derive postType from config
      const postType = Object.entries(_config.postTypeMap).find(
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
  switch (contentTypeId) {
    case 'page':
    case 'blog': {
      const postType = Object.entries(_config.postTypeMap).find(
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
      // Tags don't have translation groups
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
  const prefix = _config.urlPrefixes[contentTypeId] ?? '/';
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
  // Target locale: explicit lang param > visitor's locale
  const targetLocale = ref.lang ?? currentLocale;

  // Step 1: Find the source record
  let record: ContentRecord | null = null;

  if (ref.id) {
    record = await findById(ref.id);
  } else if (ref.slug) {
    const cleanSlug = ref.slug.replace(/^\//, '');

    // Slug resolution chain:
    // 1. Try current locale
    record = await findBySlugInLocale(cleanSlug, currentLocale, ref.type);

    // 2. Try default locale
    if (!record && currentLocale !== DEFAULT_LOCALE) {
      record = await findBySlugInLocale(cleanSlug, DEFAULT_LOCALE, ref.type);
    }

    // 3. Try any locale (catch-all)
    if (!record) {
      record = await findBySlugInLocale(cleanSlug, undefined, ref.type);
    }
  }

  if (!record) return null;

  // Step 2: If the found record's locale differs from target, find translation sibling
  if (record.lang !== targetLocale && record.translationGroup) {
    const sibling = await findSibling(
      record.translationGroup,
      targetLocale,
      record.contentTypeId,
    );
    if (sibling) {
      record = sibling;
    }
    // No sibling → fall back to the record we found (different locale but still valid)
  }

  // Step 3: Build URL
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

  // Deduplicate URIs
  const unique = new Map<string, CmsLinkRef>();
  for (const m of matches) {
    if (!unique.has(m[0])) {
      const ref = parseCmsUri(m[0]);
      if (ref) unique.set(m[0], ref);
    }
  }

  // Resolve all in parallel
  const resolved = new Map<string, string>();
  await Promise.all(
    [...unique.entries()].map(async ([uri, ref]) => {
      const link = await resolveCmsLink(ref, locale);
      if (link) resolved.set(uri, link.href);
    }),
  );

  // Replace all occurrences
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
