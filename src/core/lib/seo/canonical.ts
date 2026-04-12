/**
 * Canonical URL builder — generates absolute canonical URLs
 * with locale prefix handling for SEO metadata.
 *
 * Scope-aware: in multisite mode, each site can have its own canonical config
 * via setCanonicalConfig() called within a withScope() context.
 */

import { getScope } from '@/core/lib/infra/scope';

interface CanonicalConfig {
  /** Absolute site URL without trailing slash */
  siteUrl: string;
  /** Default locale (no URL prefix) */
  defaultLocale: string;
  /** Locale-aware path builder */
  localePath: (path: string, locale: string) => string;
}

const CONFIGS_MAX = 200;
const _configs = new Map<string, CanonicalConfig>();

/** Configure the canonical URL builder. Scope-aware — call within withScope() for per-site config. */
export function setCanonicalConfig(config: CanonicalConfig): void {
  const key = getScope() ?? '__default__';
  if (_configs.size >= CONFIGS_MAX) {
    // Evict oldest (but never evict __default__)
    for (const k of _configs.keys()) {
      if (k !== '__default__') { _configs.delete(k); break; }
    }
  }
  _configs.set(key, config);
}

/** Clear all cached configs (for testing) */
export function clearCanonicalConfigs(): void {
  _configs.clear();
}

function _getConfig(): CanonicalConfig | null {
  const key = getScope() ?? '__default__';
  return _configs.get(key) ?? _configs.get('__default__') ?? null;
}

/**
 * Build an absolute canonical URL for a given path + locale.
 *
 * @example
 * buildCanonicalUrl('/blog/my-post', 'en') → 'https://example.com/blog/my-post'
 * buildCanonicalUrl('/blog/my-post', 'de') → 'https://example.com/de/blog/my-post'
 */
export function buildCanonicalUrl(path: string, locale?: string): string {
  const _config = _getConfig();
  if (!_config) {
    // Fallback if not configured — use env var
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    return `${base}${path}`;
  }

  const loc = locale ?? _config.defaultLocale;
  return `${_config.siteUrl}${_config.localePath(path, loc)}`;
}

/**
 * Build hreflang alternates map for all locales.
 * Returns `undefined` for single-locale sites.
 */
export function buildAlternates(
  path: string,
  locales: readonly string[],
): Record<string, string> | undefined {
  const config = _getConfig();
  if (!config || locales.length <= 1) return undefined;

  const languages: Record<string, string> = {};
  for (const locale of locales) {
    languages[locale] = `${config.siteUrl}${config.localePath(path, locale)}`;
  }
  // x-default: fallback for unmatched languages
  languages['x-default'] = `${config.siteUrl}${config.localePath(path, config.defaultLocale)}`;
  return languages;
}
