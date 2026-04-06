import type { MetadataRoute } from 'next';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { siteConfig } from '@/config/site';
import { CONTENT_TYPES } from '@/config/cms';
import { LOCALES, DEFAULT_LOCALE, IS_MULTILINGUAL } from '@/lib/constants';
import type { Locale } from '@/lib/constants';
import { localePath } from '@/lib/locale';
import { PostType, ContentStatus } from '@/core/types/cms';
import { db } from '@/server/db';
import { cmsPosts, cmsCategories, cmsPortfolio, cmsShowcase, cmsTerms } from '@/server/db/schema';

export const dynamic = 'force-dynamic';

function absoluteUrl(path: string, locale: Locale): string {
  return `${siteConfig.url}${localePath(path, locale)}`;
}

function alternatesMap(path: string): Record<string, string> | undefined {
  if (!IS_MULTILINGUAL) return undefined;
  const languages: Record<string, string> = {};
  for (const locale of LOCALES) {
    languages[locale] = absoluteUrl(path, locale);
  }
  return languages;
}

type SitemapEntry = { slug: string; updatedAt: Date | null | undefined };
type SitemapFetcher = (locale: string) => Promise<SitemapEntry[]>;

interface SitemapContentConfig {
  contentTypeId: string;
  priority: number;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  fetchEntries: SitemapFetcher;
}

/**
 * Sitemap fetcher registry — maps content type IDs to their DB queries.
 * Adding a new content type only requires adding an entry here.
 */
const SITEMAP_FETCHERS: SitemapContentConfig[] = [
  {
    contentTypeId: 'page',
    priority: 0.7,
    changeFrequency: 'weekly',
    fetchEntries: (locale) =>
      db
        .select({ slug: cmsPosts.slug, updatedAt: cmsPosts.updatedAt })
        .from(cmsPosts)
        .where(and(eq(cmsPosts.type, PostType.PAGE), eq(cmsPosts.status, ContentStatus.PUBLISHED), eq(cmsPosts.lang, locale), isNull(cmsPosts.deletedAt)))
        .orderBy(desc(cmsPosts.publishedAt))
        .limit(1000),
  },
  {
    contentTypeId: 'blog',
    priority: 0.6,
    changeFrequency: 'weekly',
    fetchEntries: (locale) =>
      db
        .select({ slug: cmsPosts.slug, updatedAt: cmsPosts.updatedAt })
        .from(cmsPosts)
        .where(and(eq(cmsPosts.type, PostType.BLOG), eq(cmsPosts.status, ContentStatus.PUBLISHED), eq(cmsPosts.lang, locale), isNull(cmsPosts.deletedAt)))
        .orderBy(desc(cmsPosts.publishedAt))
        .limit(1000),
  },
  {
    contentTypeId: 'category',
    priority: 0.5,
    changeFrequency: 'monthly',
    fetchEntries: (locale) =>
      db
        .select({ slug: cmsCategories.slug, updatedAt: cmsCategories.updatedAt })
        .from(cmsCategories)
        .where(and(eq(cmsCategories.status, ContentStatus.PUBLISHED), eq(cmsCategories.lang, locale), isNull(cmsCategories.deletedAt)))
        .orderBy(desc(cmsCategories.publishedAt))
        .limit(500),
  },
  {
    contentTypeId: 'tag',
    priority: 0.4,
    changeFrequency: 'monthly',
    fetchEntries: (locale) =>
      db
        .select({ slug: cmsTerms.slug, updatedAt: cmsTerms.updatedAt })
        .from(cmsTerms)
        .where(and(eq(cmsTerms.taxonomyId, 'tag'), eq(cmsTerms.status, ContentStatus.PUBLISHED), eq(cmsTerms.lang, locale), isNull(cmsTerms.deletedAt)))
        .orderBy(desc(cmsTerms.createdAt))
        .limit(500),
  },
  {
    contentTypeId: 'portfolio',
    priority: 0.6,
    changeFrequency: 'monthly',
    fetchEntries: (locale) =>
      db
        .select({ slug: cmsPortfolio.slug, updatedAt: cmsPortfolio.updatedAt })
        .from(cmsPortfolio)
        .where(and(eq(cmsPortfolio.status, ContentStatus.PUBLISHED), eq(cmsPortfolio.lang, locale), isNull(cmsPortfolio.deletedAt)))
        .orderBy(desc(cmsPortfolio.completedAt))
        .limit(500),
  },
  {
    contentTypeId: 'showcase',
    priority: 0.5,
    changeFrequency: 'monthly',
    fetchEntries: (locale) =>
      db
        .select({ slug: cmsShowcase.slug, updatedAt: cmsShowcase.updatedAt })
        .from(cmsShowcase)
        .where(and(eq(cmsShowcase.status, ContentStatus.PUBLISHED), eq(cmsShowcase.lang, locale), isNull(cmsShowcase.deletedAt)))
        .orderBy(desc(cmsShowcase.createdAt))
        .limit(500),
  },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  // Static pages — per locale
  for (const locale of LOCALES) {
    entries.push({
      url: absoluteUrl('/', locale),
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: locale === DEFAULT_LOCALE ? 1 : 0.9,
      ...(IS_MULTILINGUAL && { alternates: { languages: alternatesMap('/') } }),
    });

    entries.push({
      url: absoluteUrl('/blog', locale),
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: locale === DEFAULT_LOCALE ? 0.8 : 0.7,
      ...(IS_MULTILINGUAL && { alternates: { languages: alternatesMap('/blog') } }),
    });

    entries.push({
      url: absoluteUrl('/portfolio', locale),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: locale === DEFAULT_LOCALE ? 0.7 : 0.6,
      ...(IS_MULTILINGUAL && { alternates: { languages: alternatesMap('/portfolio') } }),
    });

    entries.push({
      url: absoluteUrl('/showcase', locale),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: locale === DEFAULT_LOCALE ? 0.7 : 0.6,
      ...(IS_MULTILINGUAL && { alternates: { languages: alternatesMap('/showcase') } }),
    });

    entries.push({
      url: absoluteUrl('/pricing', locale),
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: locale === DEFAULT_LOCALE ? 0.8 : 0.7,
      ...(IS_MULTILINGUAL && { alternates: { languages: alternatesMap('/pricing') } }),
    });
  }

  // Dynamic content — driven by fetcher registry
  for (const config of SITEMAP_FETCHERS) {
    const ct = CONTENT_TYPES.find((c) => c.id === config.contentTypeId);
    if (!ct) continue;

    for (const locale of LOCALES) {
      const dbEntries = await config.fetchEntries(locale);

      for (const entry of dbEntries) {
        const path = ct.urlPrefix === '/' ? `/${entry.slug}` : `${ct.urlPrefix}${entry.slug}`;

        entries.push({
          url: absoluteUrl(path, locale),
          lastModified: entry.updatedAt ?? undefined,
          changeFrequency: config.changeFrequency,
          priority: config.priority,
          ...(IS_MULTILINGUAL && { alternates: { languages: alternatesMap(path) } }),
        });
      }
    }
  }

  return entries;
}
