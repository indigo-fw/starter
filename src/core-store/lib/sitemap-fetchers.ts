import { and, desc, eq, isNull } from 'drizzle-orm';

import type { SitemapFetcher } from '@/core/lib/seo/sitemap';
import { db } from '@/server/db';
import { storeProducts, storeCategories } from '@/core-store/schema/products';

/** Product + category pages — contributed to the sitemap via module config. */
export const storeSitemapFetchers: SitemapFetcher[] = [
  // Product pages (locale-independent)
  {
    urlPrefix: '/store/',
    priority: 0.7,
    changeFrequency: 'weekly',
    fetch: () =>
      db.select({ slug: storeProducts.slug, updatedAt: storeProducts.updatedAt })
        .from(storeProducts)
        .where(and(
          eq(storeProducts.status, 'published'),
          isNull(storeProducts.deletedAt)
        ))
        .orderBy(desc(storeProducts.updatedAt))
        .limit(5000),
  },
  // Category pages (locale-independent)
  {
    urlPrefix: '/store?category=',
    priority: 0.5,
    changeFrequency: 'monthly',
    fetch: () =>
      db.select({ slug: storeCategories.slug, updatedAt: storeCategories.createdAt })
        .from(storeCategories)
        .limit(500),
  },
];
