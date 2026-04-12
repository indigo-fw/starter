/**
 * Helper for integrating multisite context into tRPC and proxy.
 *
 * Simplifies the manual boilerplate needed in proxy.ts and trpc.ts:
 *
 * proxy.ts:
 *   import { applySiteHeaders } from '@/core-multisite/lib/context-helper';
 *   const headers = await applySiteHeaders(request);
 *   // Forward headers to Next.js
 *
 * trpc.ts (createContext):
 *   import { extractSiteContext, applySiteSearchPath } from '@/core-multisite/lib/context-helper';
 *   const site = extractSiteContext(req.headers);
 *   if (site) await applySiteSearchPath(site.schemaName);
 */

import type { NextRequest } from 'next/server';
import type { SiteSettings } from '@/core-multisite/schema/sites';
import { resolveSiteFromRequest, resolveDashboardSite } from './site-middleware';
import { setSiteSearchPath, resetSearchPath } from './schema-manager';
import { populateSiteConfig, type RuntimeSiteConfig } from './site-config';

export interface SiteHeaders {
  'x-site-id': string;
  'x-site-schema': string;
  'x-site-name': string;
  'x-site-locale': string;
}

/**
 * Resolve site from request and return headers to forward.
 * Call this in proxy.ts and set the returned headers on the proxied request.
 * Returns null if no site matched (single-site mode).
 */
export async function applySiteHeaders(request: NextRequest): Promise<SiteHeaders | null> {
  const isDashboard = request.nextUrl.pathname.startsWith('/dashboard');
  const site = isDashboard
    ? await resolveDashboardSite(request)
    : await resolveSiteFromRequest(request);

  if (!site) return null;

  // Populate runtime config cache for this request
  const s = site.settings as SiteSettings;
  const runtimeConfig: RuntimeSiteConfig = {
    name: site.name,
    url: site.primaryDomain ? `https://${site.primaryDomain}` : '',
    description: '',
    defaultLocale: site.defaultLocale,
    locales: site.locales,
    seo: {
      title: site.name,
      description: '',
      defaultOgImage: s.defaultOgImage ?? '',
    },
    social: {
      twitter: s.twitterHandle ?? '',
    },
    branding: {
      brandHue: s.brandHue,
      accentHue: s.accentHue,
      grayHue: s.grayHue,
      logoUrl: s.logoUrl,
      faviconUrl: s.faviconUrl,
    },
    contactEmail: s.contactEmail ?? '',
  };
  populateSiteConfig(site.id, runtimeConfig);

  return {
    'x-site-id': site.id,
    'x-site-schema': site.schemaName,
    'x-site-name': site.name,
    'x-site-locale': site.defaultLocale,
  };
}

/**
 * Extract site context from request headers (set by proxy).
 * Call this in tRPC createContext.
 */
export function extractSiteContext(headers: Headers | Record<string, string | undefined>): { siteId: string; schemaName: string } | null {
  const get = (key: string) =>
    headers instanceof Headers ? headers.get(key) : headers[key];

  const siteId = get('x-site-id');
  const schemaName = get('x-site-schema');

  if (!siteId || !schemaName) return null;
  return { siteId, schemaName };
}

/**
 * Set PostgreSQL search_path for the current site.
 * Call this after extractSiteContext in tRPC createContext.
 */
export async function applySiteSearchPath(schemaName: string): Promise<void> {
  await setSiteSearchPath(schemaName);
}

/**
 * Reset search_path to public schema.
 * Call this in afterResponse or cleanup hooks.
 */
export async function resetSiteSearchPath(): Promise<void> {
  await resetSearchPath();
}
