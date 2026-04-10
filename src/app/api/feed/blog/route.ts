import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { siteConfig } from '@/config/site';
import { resolveContentVars } from '@/core/lib/content/vars';
import { db } from '@/server/db';
import { cmsPosts } from '@/server/db/schema';
import { ContentStatus, PostType } from '@/core/types/cms';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { DEFAULT_LOCALE, LOCALES } from '@/lib/constants';
import type { Locale } from '@/lib/constants';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(request: NextRequest) {
  try {
    const langParam = request.nextUrl.searchParams.get('lang') ?? DEFAULT_LOCALE;
    const lang: Locale = LOCALES.includes(langParam as Locale)
      ? (langParam as Locale)
      : DEFAULT_LOCALE;

    const posts = await db
      .select({
        id: cmsPosts.id,
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

    const items = posts
      .map((post) => {
        const link = `${siteConfig.url}${linkPrefix}/blog/${post.slug}`;
        const pubDate = post.publishedAt
          ? new Date(post.publishedAt).toUTCString()
          : '';
        return `    <item>
      <title>${escapeXml(resolveContentVars(post.title))}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      ${post.metaDescription ? `<description>${escapeXml(resolveContentVars(post.metaDescription))}</description>` : ''}
      ${pubDate ? `<pubDate>${pubDate}</pubDate>` : ''}
    </item>`;
      })
      .join('\n');

    const feedUrl = `${siteConfig.url}/api/feed/blog${lang !== DEFAULT_LOCALE ? `?lang=${lang}` : ''}`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteConfig.name)} — Blog</title>
    <link>${escapeXml(siteConfig.url)}${linkPrefix}/blog</link>
    <description>${escapeXml(siteConfig.description)}</description>
    <language>${lang}</language>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=600, s-maxage=600',
      },
    });
  } catch {
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
