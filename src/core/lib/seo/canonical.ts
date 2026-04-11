/**
 * Canonical URL builder — generates absolute canonical URLs
 * with locale prefix handling for SEO metadata.
 */

interface CanonicalConfig {
  /** Absolute site URL without trailing slash */
  siteUrl: string;
  /** Default locale (no URL prefix) */
  defaultLocale: string;
  /** Locale-aware path builder */
  localePath: (path: string, locale: string) => string;
}

let _config: CanonicalConfig | null = null;

/** Configure the canonical URL builder. Call once at startup or in a shared config file. */
export function setCanonicalConfig(config: CanonicalConfig): void {
  _config = config;
}

/**
 * Build an absolute canonical URL for a given path + locale.
 *
 * @example
 * buildCanonicalUrl('/blog/my-post', 'en') → 'https://example.com/blog/my-post'
 * buildCanonicalUrl('/blog/my-post', 'de') → 'https://example.com/de/blog/my-post'
 */
export function buildCanonicalUrl(path: string, locale?: string): string {
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
  if (!_config || locales.length <= 1) return undefined;

  const languages: Record<string, string> = {};
  for (const locale of locales) {
    languages[locale] = `${_config.siteUrl}${_config.localePath(path, locale)}`;
  }
  return languages;
}
