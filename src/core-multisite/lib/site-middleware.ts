/**
 * Site middleware — resolves domain to site and wraps request in scope.
 * Called by proxy.ts when core-multisite is installed.
 *
 * Usage in proxy.ts:
 *   import { resolveSiteFromRequest } from '@/core-multisite/lib/site-middleware';
 *   const siteContext = await resolveSiteFromRequest(request);
 *   if (siteContext) {
 *     response.headers.set('x-site-id', siteContext.id);
 *     response.headers.set('x-site-schema', siteContext.schemaName);
 *   }
 */

import type { NextRequest } from 'next/server';
import { resolveSiteByDomain, resolveSiteBySlug, resolveSiteById, type ResolvedSite } from './site-resolver';

/** Base domain for temporary subdomains (e.g., 'yourdomain.com') */
const MULTISITE_BASE_DOMAIN = process.env.MULTISITE_BASE_DOMAIN ?? '';

/** Network admin subdomain prefix */
const NETWORK_ADMIN_SUBDOMAIN = 'admin';

export interface SiteContext {
  id: string;
  slug: string;
  schemaName: string;
  name: string;
  defaultLocale: string;
  locales: string[];
  isNetworkAdmin: boolean;
  primaryDomain: string | null;
  settings: ResolvedSite['settings'];
}

/**
 * Resolve the current site from the request's Host header.
 * Returns null if no site matches (single-site mode or unknown domain).
 *
 * Resolution order:
 * 1. Check if host is network admin subdomain (admin.yourdomain.com)
 * 2. Check if host is a temporary subdomain ({slug}.yourdomain.com)
 * 3. Check if host is a verified custom domain
 */
export async function resolveSiteFromRequest(request: NextRequest): Promise<SiteContext | null> {
  if (!MULTISITE_BASE_DOMAIN) return null; // Multisite not configured

  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase();
  if (!host) return null;

  // 1. Network admin subdomain
  if (host === `${NETWORK_ADMIN_SUBDOMAIN}.${MULTISITE_BASE_DOMAIN}`) {
    // Look for the network admin site
    const site = await resolveSiteBySlug('__network__');
    if (site?.isNetworkAdmin) return toContext(site);
    return null;
  }

  // 2. Temporary subdomain ({slug}.yourdomain.com)
  if (host.endsWith(`.${MULTISITE_BASE_DOMAIN}`)) {
    const slug = host.replace(`.${MULTISITE_BASE_DOMAIN}`, '');
    if (slug && !slug.includes('.')) {
      const site = await resolveSiteBySlug(slug);
      if (site) return toContext(site);
    }
    return null;
  }

  // 3. Custom domain — normalize www prefix
  const normalizedHost = host.replace(/^www\./, '');
  const site = await resolveSiteByDomain(normalizedHost);
  if (site) return toContext(site);

  // Try with www if bare domain failed
  if (!host.startsWith('www.')) {
    const wwwSite = await resolveSiteByDomain(`www.${host}`);
    if (wwwSite) return toContext(wwwSite);
  }

  return null;
}

/**
 * Resolve active site for dashboard requests.
 * Reads the `active-site` cookie set by the SiteSwitcher component.
 * Falls back to domain-based resolution.
 */
export async function resolveDashboardSite(request: NextRequest): Promise<SiteContext | null> {
  // Check active-site cookie first (set by site switcher)
  const activeSiteId = request.cookies.get('active-site')?.value;
  if (activeSiteId) {
    const site = await resolveSiteById(activeSiteId);
    if (site) return toContext(site);
  }

  // Fall back to domain-based resolution
  return resolveSiteFromRequest(request);
}

function toContext(site: ResolvedSite): SiteContext {
  return {
    id: site.id,
    slug: site.slug,
    schemaName: site.schemaName,
    name: site.name,
    defaultLocale: site.defaultLocale,
    locales: site.locales,
    isNetworkAdmin: site.isNetworkAdmin,
    primaryDomain: site.primaryDomain,
    settings: site.settings,
  };
}
