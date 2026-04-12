/**
 * Runtime site config resolver.
 *
 * In single-site mode: returns values from site.ts (static config).
 * In multisite mode: returns values from the current site's cached config,
 * populated by request middleware after resolving the site.
 *
 * Pattern: middleware calls populateSiteConfig() once per request,
 * downstream code calls getRuntimeSiteConfig() to read it.
 */

import { getScope } from '@/core/lib/infra/scope';
import { siteConfig as staticConfig, siteDefaults } from '@/config/site';
import { DEFAULT_LOCALE, LOCALES } from '@/lib/constants';

export interface RuntimeSiteConfig {
  name: string;
  url: string;
  description: string;
  defaultLocale: string;
  locales: string[];
  seo: {
    title: string;
    description: string;
    defaultOgImage: string;
  };
  social: {
    twitter: string;
  };
  branding: {
    brandHue?: number;
    accentHue?: number;
    grayHue?: number;
    logoUrl?: string;
    faviconUrl?: string;
  };
  contactEmail: string;
}

/** Static fallback — used in single-site mode or before site is resolved */
const STATIC_FALLBACK: RuntimeSiteConfig = {
  name: staticConfig.name,
  url: staticConfig.url,
  description: staticConfig.description,
  defaultLocale: DEFAULT_LOCALE,
  locales: [...LOCALES],
  seo: {
    title: staticConfig.seo.title,
    description: staticConfig.seo.description,
    defaultOgImage: staticConfig.seo.defaultOgImage,
  },
  social: {
    twitter: staticConfig.social.twitter,
  },
  branding: {},
  contactEmail: siteDefaults.contactEmail,
};

// Per-site config cache (scopeId → config, 5min TTL)
const _cache = new Map<string, { config: RuntimeSiteConfig; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Get the current site's runtime config.
 * Returns static siteConfig when no scope is active (single-site mode).
 */
export function getRuntimeSiteConfig(): RuntimeSiteConfig {
  const scope = getScope();
  if (!scope) return STATIC_FALLBACK;

  const cached = _cache.get(scope);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.config;
  }

  // Scope is set but no config populated yet — return static fallback.
  // This happens on the very first request before middleware runs.
  return STATIC_FALLBACK;
}

/**
 * Populate site config from resolved site data.
 * Called once per request by the site middleware after resolving the site.
 */
export function populateSiteConfig(scope: string, config: RuntimeSiteConfig): void {
  _cache.set(scope, { config, ts: Date.now() });
}

/** Invalidate a site's cached config (call when site settings change) */
export function invalidateSiteConfig(scope: string): void {
  _cache.delete(scope);
}

/** Clear all cached site configs */
export function clearSiteConfigCache(): void {
  _cache.clear();
}
