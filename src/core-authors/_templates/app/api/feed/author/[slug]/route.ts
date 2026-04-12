import type { NextRequest } from 'next/server';

import { siteConfig } from '@/config/site';
import { resolveContentVars } from '@/core/lib/content/vars';
import { generateRssFeed, createRssResponse } from '@/core/lib/content/rss';
import { db } from '@/server/db';
import { cmsPosts } from '@/server/db/schema';
import { cmsAuthors, cmsAuthorRelationships } from '@/core-authors/schema/authors';
import { ContentStatus, PostType } from '@/core/types/cms';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DEFAULT_LOCALE, LOCALES } from '@/lib/constants';
import type { Locale } from '@/lib/constants';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params;
    const langParam = request.nextUrl.searchParams.get('lang') ?? DEFAULT_LOCALE;
    const lang: Locale = LOCALES.includes(langParam as Locale)
      ? (langParam as Locale)
      : DEFAULT_LOCALE;

    const [author] = await db
      .select({ id: cmsAuthors.id, name: cmsAuthors.name })
      .from(cmsAuthors)
      .where(eq(cmsAuthors.slug, slug))
      .limit(1);

    if (!author) {
      return new Response('Author not found', { status: 404 });
    }

    const posts = await db
      .select({
        title: cmsPosts.title,
        slug: cmsPosts.slug,
        type: cmsPosts.type,
        metaDescription: cmsPosts.metaDescription,
        publishedAt: cmsPosts.publishedAt,
      })
      .from(cmsPosts)
      .innerJoin(
        cmsAuthorRelationships,
        eq(cmsPosts.id, cmsAuthorRelationships.objectId),
      )
      .where(
        and(
          eq(cmsAuthorRelationships.authorId, author.id),
          eq(cmsPosts.lang, lang),
          eq(cmsPosts.status, ContentStatus.PUBLISHED),
          isNull(cmsPosts.deletedAt),
        ),
      )
      .orderBy(desc(cmsPosts.publishedAt))
      .limit(20);

    const linkPrefix = lang === DEFAULT_LOCALE ? '' : `/${lang}`;

    const xml = generateRssFeed(
      {
        title: `Posts by ${author.name} | ${siteConfig.name}`,
        link: `${siteConfig.url}${linkPrefix}/author/${slug}`,
        description: `Latest posts by ${author.name}`,
        language: lang,
        feedUrl: `${siteConfig.url}/api/feed/author/${slug}${lang !== DEFAULT_LOCALE ? `?lang=${lang}` : ''}`,
      },
      posts.map((post) => ({
        title: resolveContentVars(post.title),
        link: post.type === PostType.BLOG
          ? `${siteConfig.url}${linkPrefix}/blog/${post.slug}`
          : `${siteConfig.url}${linkPrefix}/${post.slug}`,
        description: post.metaDescription ? resolveContentVars(post.metaDescription) : undefined,
        pubDate: post.publishedAt ?? undefined,
      })),
    );

    return createRssResponse(xml);
  } catch {
    return new Response('Internal Server Error', { status: 500 });
  }
}
