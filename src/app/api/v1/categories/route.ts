import { and, asc, count as drizzleCount, eq, isNull } from 'drizzle-orm';

import { db } from '@/server/db';
import { cmsCategories } from '@/server/db/schema';
import { ContentStatus } from '@/core/types/cms';
import { withApiRoute, parseApiPagination, paginatedApiResponse } from '@/core/lib/api-route';

export async function GET(request: Request) {
  return withApiRoute(request, async (url) => {
    const { page, pageSize, offset } = parseApiPagination(url);
    const lang = url.searchParams.get('lang') ?? undefined;

    const conditions = [
      eq(cmsCategories.status, ContentStatus.PUBLISHED),
      isNull(cmsCategories.deletedAt),
    ];
    if (lang) conditions.push(eq(cmsCategories.lang, lang));

    const where = and(...conditions);

    const [categories, countResult] = await Promise.all([
      db
        .select({
          id: cmsCategories.id,
          name: cmsCategories.name,
          slug: cmsCategories.slug,
          lang: cmsCategories.lang,
          title: cmsCategories.title,
          text: cmsCategories.text,
          icon: cmsCategories.icon,
          metaDescription: cmsCategories.metaDescription,
          seoTitle: cmsCategories.seoTitle,
          order: cmsCategories.order,
          publishedAt: cmsCategories.publishedAt,
          createdAt: cmsCategories.createdAt,
          updatedAt: cmsCategories.updatedAt,
        })
        .from(cmsCategories)
        .where(where)
        .orderBy(asc(cmsCategories.order))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: drizzleCount() })
        .from(cmsCategories)
        .where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return paginatedApiResponse(categories, { total, page, pageSize });
  });
}
