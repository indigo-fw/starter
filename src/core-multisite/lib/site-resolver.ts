/**
 * Site resolver — maps domain/subdomain to site record.
 * Called by the proxy to determine which site is being accessed.
 * Results cached in-memory with short TTL for performance.
 */

import { eq, and, isNull } from 'drizzle-orm';
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
    _domainCache.set(domain, { site: null, ts: Date.now() });
    return null;
  }

  const site = await resolveSiteById(domainRow.siteId);
  _domainCache.set(domain, { site, ts: Date.now() });
  return site;
}

/** Resolve a subdomain slug (e.g., 'my-store' from 'my-store.yourdomain.com') to a site */
export async function resolveSiteBySlug(slug: string): Promise<ResolvedSite | null> {
  const cached = getCached(_slugCache, slug);
  if (cached !== undefined) return cached;

  const site = await resolveSiteById(null, slug);
  _slugCache.set(slug, { site, ts: Date.now() });
  return site;
}

export async function resolveSiteById(id: string | null, slug?: string): Promise<ResolvedSite | null> {
  const condition = id
    ? and(eq(sites.id, id), eq(sites.status, SiteStatus.ACTIVE), isNull(sites.deletedAt))
    : and(eq(sites.slug, slug!), eq(sites.status, SiteStatus.ACTIVE), isNull(sites.deletedAt));

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
