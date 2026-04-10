import { and, count as drizzleCount, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/server/db';
import { cmsPosts } from '@/server/db/schema';
import { ContentStatus } from '@/core/types/cms';
import { withApiRoute, parseApiPagination, paginatedApiResponse } from '@/core/lib/api/api-route';

export async function GET(request: Request) {
  return withApiRoute(request, async (url) => {
    const { page, pageSize, offset } = parseApiPagination(url);
    const lang = url.searchParams.get('lang') ?? undefined;
    const type = url.searchParams.get('type') ?? undefined;

    const conditions = [
      eq(cmsPosts.status, ContentStatus.PUBLISHED),
      isNull(cmsPosts.deletedAt),
    ];
    if (lang) conditions.push(eq(cmsPosts.lang, lang));
    if (type) conditions.push(eq(cmsPosts.type, parseInt(type, 10)));

    const where = and(...conditions);

    const [posts, countResult] = await Promise.all([
      db
        .select({
          id: cmsPosts.id,
          title: cmsPosts.title,
          slug: cmsPosts.slug,
          content: cmsPosts.content,
          type: cmsPosts.type,
          lang: cmsPosts.lang,
          metaDescription: cmsPosts.metaDescription,
          seoTitle: cmsPosts.seoTitle,
          featuredImage: cmsPosts.featuredImage,
          publishedAt: cmsPosts.publishedAt,
          createdAt: cmsPosts.createdAt,
          updatedAt: cmsPosts.updatedAt,
        })
        .from(cmsPosts)
        .where(where)
        .orderBy(desc(cmsPosts.publishedAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: drizzleCount() }).from(cmsPosts).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return paginatedApiResponse(posts, { total, page, pageSize });
  });
}
