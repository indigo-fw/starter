/**
 * Google News Sitemap — /news-sitemap.xml
 *
 * Returns articles published within the last 2 days (Google News requirement).
 * Register this URL in Google Search Console under Sitemaps.
 *
 * Prerequisites:
 * - Site must be registered as a Google News publisher
 * - Update publicationName below to match your registration
 */

import { and, desc, eq, gte, isNull } from 'drizzle-orm';

import { siteConfig } from '@/config/site';
import { localePath } from '@/lib/locale';
import { DEFAULT_LOCALE } from '@/lib/constants';
import { ContentStatus } from '@/core/types/cms';
import { db } from '@/server/db';
import { cmsPosts } from '@/server/db/schema';
import { CONTENT_TYPES } from '@/config/cms';
import { generateNewsSitemap } from '@/core-authors/lib/news-sitemap';

export const dynamic = 'force-dynamic';

export async function GET() {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  // Fetch recently published posts across all post-backed content types
  const posts = await db
    .select({
      slug: cmsPosts.slug,
      title: cmsPosts.title,
      type: cmsPosts.type,
      lang: cmsPosts.lang,
      publishedAt: cmsPosts.publishedAt,
    })
    .from(cmsPosts)
    .where(
      and(
        eq(cmsPosts.status, ContentStatus.PUBLISHED),
        gte(cmsPosts.publishedAt, twoDaysAgo),
        isNull(cmsPosts.deletedAt),
      ),
    )
    .orderBy(desc(cmsPosts.publishedAt))
    .limit(1000);

  const articles = posts
    .filter((p) => p.publishedAt !== null)
    .map((post) => {
      const ct = CONTENT_TYPES.find((c) => c.postType === post.type);
      const urlPrefix = ct?.urlPrefix ?? '/';
      const path = urlPrefix === '/' ? `/${post.slug}` : `${urlPrefix}${post.slug}`;
      return {
        url: `${siteConfig.url}${localePath(path, post.lang as typeof DEFAULT_LOCALE)}`,
        title: post.title,
        publishedAt: post.publishedAt!,
        lang: post.lang,
      };
    });

  const xml = generateNewsSitemap(
    { publicationName: siteConfig.name },
    articles,
  );

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=900',
    },
  });
}
