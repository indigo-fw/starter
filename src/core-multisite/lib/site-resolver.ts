/**
 * Site resolver — maps domain/subdomain/ID to site record.
 * Called by the proxy (public) and dashboard middleware (admin).
 * Results cached in-memory with 60s TTL.
 *
 * Public resolution (default): only ACTIVE sites.
 * Dashboard resolution: ACTIVE + SUSPENDED (via allowSuspended param).
 */

import { eq, and, isNull, ne } from 'drizzle-orm';
import { db } from '@/server/db';
import { sites, siteDomains, SiteStatus } from '@/core-multisite/schema/sites';
import type { SiteSettings } from '@/core-multisite/schema/sites';

export interface ResolvedSite {
  id: string;
  slug: string;
  schemaName: string;
  name: string;
  defaultLocale: string;
  locales: string[];
  settings: SiteSettings;
  isNetworkAdmin: boolean;
  primaryDomain: string | null;
}

// In-memory cache with 60s TTL
const CACHE_TTL = 60 * 1000;
// Keys come from the Host header (domain / subdomain slug), so they are
// attacker-controlled — without a cap, scanner noise grows the maps forever
// (expired entries are only deleted when the same key is read again).
const CACHE_MAX = 500;
const _domainCache = new Map<string, { site: ResolvedSite | null; ts: number }>();
const _slugCache = new Map<string, { site: ResolvedSite | null; ts: number }>();

function getCached(cache: Map<string, { site: ResolvedSite | null; ts: number }>, key: string): ResolvedSite | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return undefined;
  }
  return entry.site;
}

function setCached(cache: Map<string, { site: ResolvedSite | null; ts: number }>, key: string, site: ResolvedSite | null): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { site, ts: Date.now() });
}

/** Resolve a custom domain to a site */
export async function resolveSiteByDomain(domain: string): Promise<ResolvedSite | null> {
  const cached = getCached(_domainCache, domain);
  if (cached !== undefined) return cached;

  const [domainRow] = await db
    .select({
      siteId: siteDomains.siteId,
      isPrimary: siteDomains.isPrimary,
    })
    .from(siteDomains)
    .where(and(eq(siteDomains.domain, domain), eq(siteDomains.verified, true)))
    .limit(1);

  if (!domainRow) {
    setCached(_domainCache, domain, null);
    return null;
  }

  const site = await resolveSiteById(domainRow.siteId);
  setCached(_domainCache, domain, site);
  return site;
}

/** Resolve a subdomain slug (e.g., 'my-store' from 'my-store.yourdomain.com') to a site */
export async function resolveSiteBySlug(slug: string): Promise<ResolvedSite | null> {
  const cached = getCached(_slugCache, slug);
  if (cached !== undefined) return cached;

  const site = await resolveSiteById(null, slug);
  setCached(_slugCache, slug, site);
  return site;
}

/**
 * Resolve site by ID or slug.
 * @param allowSuspended — if true, also resolves suspended sites (for dashboard/admin use)
 */
export async function resolveSiteById(id: string | null, slug?: string, allowSuspended = false): Promise<ResolvedSite | null> {
  // Public: only ACTIVE. Admin: ACTIVE + SUSPENDED (not DELETED).
  const statusCondition = allowSuspended
    ? ne(sites.status, SiteStatus.DELETED)
    : eq(sites.status, SiteStatus.ACTIVE);

  const condition = id
    ? and(eq(sites.id, id), statusCondition, isNull(sites.deletedAt))
    : and(eq(sites.slug, slug!), statusCondition, isNull(sites.deletedAt));

  const [siteRow] = await db.select().from(sites).where(condition).limit(1);
  if (!siteRow) return null;

  // Get primary domain
  const [primaryDomain] = await db
    .select({ domain: siteDomains.domain })
    .from(siteDomains)
    .where(and(eq(siteDomains.siteId, siteRow.id), eq(siteDomains.isPrimary, true), eq(siteDomains.verified, true)))
    .limit(1);

  return {
    id: siteRow.id,
    slug: siteRow.slug,
    schemaName: siteRow.schemaName,
    name: siteRow.name,
    defaultLocale: siteRow.defaultLocale,
    locales: siteRow.locales,
    settings: siteRow.settings,
    isNetworkAdmin: siteRow.isNetworkAdmin,
    primaryDomain: primaryDomain?.domain ?? null,
  };
}

/** Invalidate cached site resolution (call when domains/sites change) */
export function invalidateSiteCache(domain?: string, slug?: string): void {
  if (domain) _domainCache.delete(domain);
  if (slug) _slugCache.delete(slug);
}

/** Clear all site resolution caches */
export function clearSiteCache(): void {
  _domainCache.clear();
  _slugCache.clear();
}
