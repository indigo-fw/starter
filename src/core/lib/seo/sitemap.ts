/**
 * Sitemap generator — builds a Next.js MetadataRoute.Sitemap from
 * static pages + dynamic content fetchers provided by the project.
 */

import type { MetadataRoute } from 'next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChangeFreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

export interface SitemapConfig<L extends string = string> {
  /** Absolute site URL without trailing slash (e.g. "https://example.com") */
  siteUrl: string;
  /** All supported locale codes */
  locales: readonly L[];
  /** Default locale (no URL prefix) */
  defaultLocale: L;
  /** Whether the site is multilingual */
  isMultilingual: boolean;
  /** Locale-aware path builder — prepends locale prefix for non-default locales */
  localePath: (path: string, locale: L) => string;
}

export interface SitemapStaticPage {
  path: string;
  changeFrequency: ChangeFreq;
  priority: number;
  /** Optional: priority boost for default locale (default locale gets this, others get priority) */
  defaultLocalePriority?: number;
}

export interface SitemapFetcher {
  /** URL prefix for this content type (e.g. "/blog/", "/"). Used to build full path. */
  urlPrefix: string;
  priority: number;
  changeFrequency: ChangeFreq;
  /** Fetch entries for a given locale. Returns slugs + optional updatedAt. */
  fetch: (locale: string) => Promise<Array<{ slug: string; updatedAt?: Date | null }>>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function absoluteUrl<L extends string>(siteUrl: string, localePath: (path: string, locale: L) => string, path: string, locale: L): string {
  return `${siteUrl}${localePath(path, locale)}`;
}

function alternatesMap<L extends string>(
  config: SitemapConfig<L>,
  path: string,
): Record<string, string> | undefined {
  if (!config.isMultilingual) return undefined;
  const languages: Record<string, string> = {};
  for (const locale of config.locales) {
    languages[locale] = absoluteUrl(config.siteUrl, config.localePath, path, locale);
  }
  // x-default: fallback for unmatched languages, points to default locale
  languages['x-default'] = absoluteUrl(config.siteUrl, config.localePath, path, config.defaultLocale);
  return languages;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export async function generateSitemap<L extends string>(
  config: SitemapConfig<L>,
  staticPages: SitemapStaticPage[],
  fetchers: SitemapFetcher[],
): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  // Static pages — one entry per locale
  for (const locale of config.locales) {
    for (const page of staticPages) {
      const isDefault = locale === config.defaultLocale;
      entries.push({
        url: absoluteUrl(config.siteUrl, config.localePath, page.path, locale),
        lastModified: new Date(),
        changeFrequency: page.changeFrequency,
        priority: isDefault ? (page.defaultLocalePriority ?? page.priority) : page.priority,
        ...(config.isMultilingual && { alternates: { languages: alternatesMap(config, page.path) } }),
      });
    }
  }

  // Dynamic content — driven by fetcher registry
  for (const fetcher of fetchers) {
    for (const locale of config.locales) {
      const dbEntries = await fetcher.fetch(locale);

      for (const entry of dbEntries) {
        const path = fetcher.urlPrefix === '/'
          ? `/${entry.slug}`
          : `${fetcher.urlPrefix}${entry.slug}`;

        entries.push({
          url: absoluteUrl(config.siteUrl, config.localePath, path, locale),
          lastModified: entry.updatedAt ?? undefined,
          changeFrequency: fetcher.changeFrequency,
          priority: fetcher.priority,
          ...(config.isMultilingual && { alternates: { languages: alternatesMap(config, path) } }),
        });
      }
    }
  }

  return entries;
}
