import { and, desc, eq, isNull } from 'drizzle-orm';

import { siteConfig } from '@/config/site';
import { CONTENT_TYPES } from '@/config/cms';
import { LOCALES, DEFAULT_LOCALE, IS_MULTILINGUAL } from '@/lib/constants';
import { localePath } from '@/lib/locale';
import { PostType, ContentStatus } from '@/core/types/cms';
import { generateSitemap } from '@/core/lib/seo/sitemap';
import type { SitemapStaticPage, SitemapFetcher } from '@/core/lib/seo/sitemap';
import { db } from '@/server/db';
import { cmsPosts, cmsCategories, cmsPortfolio, cmsShowcase, cmsTerms } from '@/server/db/schema';
import { cmsAuthors } from '@/core-authors/schema/authors';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Static pages — project-specific routes
// ---------------------------------------------------------------------------

const STATIC_PAGES: SitemapStaticPage[] = [
  { path: '/', changeFrequency: 'daily', priority: 0.9, defaultLocalePriority: 1 },
  { path: '/blog', changeFrequency: 'daily', priority: 0.7, defaultLocalePriority: 0.8 },
  { path: '/portfolio', changeFrequency: 'weekly', priority: 0.6, defaultLocalePriority: 0.7 },
  { path: '/showcase', changeFrequency: 'weekly', priority: 0.6, defaultLocalePriority: 0.7 },
  { path: '/pricing', changeFrequency: 'monthly', priority: 0.7, defaultLocalePriority: 0.8 },
];

// ---------------------------------------------------------------------------
// Content fetchers — project-specific DB queries
// ---------------------------------------------------------------------------

const CONTENT_FETCHERS: SitemapFetcher[] = [
  {
    urlPrefix: CONTENT_TYPES.find((c) => c.id === 'page')?.urlPrefix ?? '/',
    priority: 0.7,
    changeFrequency: 'weekly',
    fetch: (locale) =>
      db.select({ slug: cmsPosts.slug, updatedAt: cmsPosts.updatedAt }).from(cmsPosts)
        .where(and(eq(cmsPosts.type, PostType.PAGE), eq(cmsPosts.status, ContentStatus.PUBLISHED), eq(cmsPosts.lang, locale), isNull(cmsPosts.deletedAt)))
        .orderBy(desc(cmsPosts.publishedAt)).limit(1000),
  },
  {
    urlPrefix: CONTENT_TYPES.find((c) => c.id === 'blog')?.urlPrefix ?? '/blog/',
    priority: 0.6,
    changeFrequency: 'weekly',
    fetch: (locale) =>
      db.select({ slug: cmsPosts.slug, updatedAt: cmsPosts.updatedAt }).from(cmsPosts)
        .where(and(eq(cmsPosts.type, PostType.BLOG), eq(cmsPosts.status, ContentStatus.PUBLISHED), eq(cmsPosts.lang, locale), isNull(cmsPosts.deletedAt)))
        .orderBy(desc(cmsPosts.publishedAt)).limit(1000),
  },
  {
    urlPrefix: CONTENT_TYPES.find((c) => c.id === 'category')?.urlPrefix ?? '/category/',
    priority: 0.5,
    changeFrequency: 'monthly',
    fetch: (locale) =>
      db.select({ slug: cmsCategories.slug, updatedAt: cmsCategories.updatedAt }).from(cmsCategories)
        .where(and(eq(cmsCategories.status, ContentStatus.PUBLISHED), eq(cmsCategories.lang, locale), isNull(cmsCategories.deletedAt)))
        .orderBy(desc(cmsCategories.publishedAt)).limit(500),
  },
  {
    urlPrefix: CONTENT_TYPES.find((c) => c.id === 'tag')?.urlPrefix ?? '/tag/',
    priority: 0.4,
    changeFrequency: 'monthly',
    fetch: (locale) =>
      db.select({ slug: cmsTerms.slug, updatedAt: cmsTerms.updatedAt }).from(cmsTerms)
        .where(and(eq(cmsTerms.taxonomyId, 'tag'), eq(cmsTerms.status, ContentStatus.PUBLISHED), eq(cmsTerms.lang, locale), isNull(cmsTerms.deletedAt)))
        .orderBy(desc(cmsTerms.createdAt)).limit(500),
  },
  {
    urlPrefix: CONTENT_TYPES.find((c) => c.id === 'portfolio')?.urlPrefix ?? '/portfolio/',
    priority: 0.6,
    changeFrequency: 'monthly',
    fetch: (locale) =>
      db.select({ slug: cmsPortfolio.slug, updatedAt: cmsPortfolio.updatedAt }).from(cmsPortfolio)
        .where(and(eq(cmsPortfolio.status, ContentStatus.PUBLISHED), eq(cmsPortfolio.lang, locale), isNull(cmsPortfolio.deletedAt)))
        .orderBy(desc(cmsPortfolio.completedAt)).limit(500),
  },
  {
    urlPrefix: CONTENT_TYPES.find((c) => c.id === 'showcase')?.urlPrefix ?? '/showcase/',
    priority: 0.5,
    changeFrequency: 'monthly',
    fetch: (locale) =>
      db.select({ slug: cmsShowcase.slug, updatedAt: cmsShowcase.updatedAt }).from(cmsShowcase)
        .where(and(eq(cmsShowcase.status, ContentStatus.PUBLISHED), eq(cmsShowcase.lang, locale), isNull(cmsShowcase.deletedAt)))
        .orderBy(desc(cmsShowcase.createdAt)).limit(500),
  },
  // core-authors: author profile pages (locale-independent — same profile for all languages)
  {
    urlPrefix: '/author/',
    priority: 0.5,
    changeFrequency: 'monthly',
    fetch: () =>
      db.select({ slug: cmsAuthors.slug, updatedAt: cmsAuthors.updatedAt }).from(cmsAuthors)
        .orderBy(cmsAuthors.name).limit(500),
  },
  // core-store: product pages (locale-independent)
  {
    urlPrefix: '/store/',
    priority: 0.7,
    changeFrequency: 'weekly',
    fetch: async () => {
      const { storeProducts } = await import('@/core-store/schema/products');
      return db.select({ slug: storeProducts.slug, updatedAt: storeProducts.updatedAt })
        .from(storeProducts)
        .where(and(
          eq(storeProducts.status, 'published'),
          isNull(storeProducts.deletedAt)
        ))
        .orderBy(desc(storeProducts.updatedAt))
        .limit(5000);
    },
  },
  // core-store: category pages (locale-independent)
  {
    urlPrefix: '/store?category=',
    priority: 0.5,
    changeFrequency: 'monthly',
    fetch: async () => {
      const { storeCategories } = await import('@/core-store/schema/products');
      return db.select({ slug: storeCategories.slug, updatedAt: storeCategories.createdAt })
        .from(storeCategories)
        .limit(500);
    },
  },
];

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default function sitemap() {
  return generateSitemap(
    {
      siteUrl: siteConfig.url,
      locales: LOCALES,
      defaultLocale: DEFAULT_LOCALE,
      isMultilingual: IS_MULTILINGUAL,
      localePath,
    },
    STATIC_PAGES,
    CONTENT_FETCHERS,
  );
}
