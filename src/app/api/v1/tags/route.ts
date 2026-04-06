import { and, asc, count as drizzleCount, eq, isNull } from 'drizzle-orm';

import { db } from '@/server/db';
import { cmsTerms } from '@/server/db/schema';
import { ContentStatus } from '@/core/types/cms';
import { withApiRoute, parseApiPagination, paginatedApiResponse } from '@/core/lib/api-route';

export async function GET(request: Request) {
  return withApiRoute(request, async (url) => {
    const { page, pageSize, offset } = parseApiPagination(url);
    const lang = url.searchParams.get('lang') ?? undefined;
    const taxonomyId = url.searchParams.get('taxonomyId') ?? undefined;

    const conditions = [
      eq(cmsTerms.status, ContentStatus.PUBLISHED),
      isNull(cmsTerms.deletedAt),
    ];
    if (lang) conditions.push(eq(cmsTerms.lang, lang));
    if (taxonomyId) conditions.push(eq(cmsTerms.taxonomyId, taxonomyId));

    const where = and(...conditions);

    const [tags, countResult] = await Promise.all([
      db
        .select({
          id: cmsTerms.id,
          taxonomyId: cmsTerms.taxonomyId,
          name: cmsTerms.name,
          slug: cmsTerms.slug,
          lang: cmsTerms.lang,
          order: cmsTerms.order,
          createdAt: cmsTerms.createdAt,
          updatedAt: cmsTerms.updatedAt,
        })
        .from(cmsTerms)
        .where(where)
        .orderBy(asc(cmsTerms.order))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: drizzleCount() }).from(cmsTerms).where(where),
    ]);

    const total = countResult[0]?.count ?? 0;
    return paginatedApiResponse(tags, { total, page, pageSize });
  });
}
