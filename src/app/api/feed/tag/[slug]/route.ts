import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { siteConfig } from '@/config/site';
import { resolveContentVars } from '@/core/lib/content-vars';
import { db } from '@/server/db';
import { cmsPosts, cmsTerms, cmsTermRelationships } from '@/server/db/schema';
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

    // Resolve tag
    const [tag] = await db
      .select({ id: cmsTerms.id, name: cmsTerms.name })
      .from(cmsTerms)
      .where(
        and(
          eq(cmsTerms.taxonomyId, 'tag'),
          eq(cmsTerms.slug, slug),
          eq(cmsTerms.lang, lang),
          eq(cmsTerms.status, ContentStatus.PUBLISHED),
          isNull(cmsTerms.deletedAt)
        )
      )
      .limit(1);

    if (!tag) {
      return new NextResponse('Tag not found', { status: 404 });
    }

    // Fetch posts with this tag
    const posts = await db
      .select({
        id: cmsPosts.id,
        title: cmsPosts.title,
        slug: cmsPosts.slug,
        type: cmsPosts.type,
        metaDescription: cmsPosts.metaDescription,
        publishedAt: cmsPosts.publishedAt,
      })
      .from(cmsPosts)
      .innerJoin(
        cmsTermRelationships,
        and(
          eq(cmsPosts.id, cmsTermRelationships.objectId),
          eq(cmsTermRelationships.taxonomyId, 'tag'),
          eq(cmsTermRelationships.termId, tag.id)
        )
      )
      .where(
        and(
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
        const isBlog = post.type === PostType.BLOG;
        const link = isBlog
          ? `${siteConfig.url}${linkPrefix}/blog/${post.slug}`
          : `${siteConfig.url}${linkPrefix}/${post.slug}`;
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

    const feedUrl = `${siteConfig.url}/api/feed/tag/${slug}${lang !== DEFAULT_LOCALE ? `?lang=${lang}` : ''}`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Posts tagged "${escapeXml(tag.name)}" | ${escapeXml(siteConfig.name)}</title>
    <link>${escapeXml(siteConfig.url)}${linkPrefix}/tag/${escapeXml(slug)}</link>
    <description>Posts tagged with "${escapeXml(tag.name)}"</description>
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
