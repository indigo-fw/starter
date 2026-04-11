import type { NextRequest } from 'next/server';

import { siteConfig } from '@/config/site';
import { resolveContentVars } from '@/core/lib/content/vars';
import { generateRssFeed, createRssResponse } from '@/core/lib/content/rss';
import { db } from '@/server/db';
import { cmsPosts } from '@/server/db/schema';
import { ContentStatus, PostType } from '@/core/types/cms';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DEFAULT_LOCALE, LOCALES } from '@/lib/constants';
import type { Locale } from '@/lib/constants';

export async function GET(request: NextRequest) {
  try {
    const langParam = request.nextUrl.searchParams.get('lang') ?? DEFAULT_LOCALE;
    const lang: Locale = LOCALES.includes(langParam as Locale)
      ? (langParam as Locale)
      : DEFAULT_LOCALE;

    const posts = await db
      .select({
        title: cmsPosts.title,
        slug: cmsPosts.slug,
        metaDescription: cmsPosts.metaDescription,
        publishedAt: cmsPosts.publishedAt,
      })
      .from(cmsPosts)
      .where(
        and(
          eq(cmsPosts.type, PostType.BLOG),
          eq(cmsPosts.lang, lang),
          eq(cmsPosts.status, ContentStatus.PUBLISHED),
          isNull(cmsPosts.deletedAt)
        )
      )
      .orderBy(desc(cmsPosts.publishedAt))
      .limit(20);

    const linkPrefix = lang === DEFAULT_LOCALE ? '' : `/${lang}`;

    const xml = generateRssFeed(
      {
        title: `Blog | ${siteConfig.name}`,
        link: `${siteConfig.url}${linkPrefix}/blog`,
        description: siteConfig.description,
        language: lang,
        feedUrl: `${siteConfig.url}/api/feed/blog${lang !== DEFAULT_LOCALE ? `?lang=${lang}` : ''}`,
      },
      posts.map((post) => ({
        title: resolveContentVars(post.title),
        link: `${siteConfig.url}${linkPrefix}/blog/${post.slug}`,
        description: post.metaDescription ? resolveContentVars(post.metaDescription) : undefined,
        pubDate: post.publishedAt ?? undefined,
      })),
    );

    return createRssResponse(xml);
  } catch {
    return new Response('Internal Server Error', { status: 500 });
  }
}
