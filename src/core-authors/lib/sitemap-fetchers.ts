import type { SitemapFetcher } from '@/core/lib/seo/sitemap';
import { db } from '@/server/db';
import { cmsAuthors } from '@/core-authors/schema/authors';

/** Author profile pages — contributed to the sitemap via module config. */
export const authorsSitemapFetcher: SitemapFetcher = {
  urlPrefix: '/author/',
  priority: 0.5,
  changeFrequency: 'monthly',
  fetch: () =>
    db
      .select({ slug: cmsAuthors.slug, updatedAt: cmsAuthors.updatedAt })
      .from(cmsAuthors)
      .orderBy(cmsAuthors.name)
      .limit(500),
};
