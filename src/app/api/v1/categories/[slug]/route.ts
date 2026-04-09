import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/server/db';
import { cmsCategories } from '@/server/db/schema';
import { ContentStatus } from '@/core/types/cms';
import { withApiRoute } from '@/core/lib/api-route';
import { apiHeaders } from '@/core/lib/api-auth';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  return withApiRoute(request, async (url) => {
    const { slug } = await params;
    const lang = url.searchParams.get('lang') ?? undefined;

    const conditions = [
      eq(cmsCategories.slug, slug),
      eq(cmsCategories.status, ContentStatus.PUBLISHED),
      isNull(cmsCategories.deletedAt),
    ];
    if (lang) conditions.push(eq(cmsCategories.lang, lang));

    const [category] = await db
      .select({
        id: cmsCategories.id,
        name: cmsCategories.name,
        slug: cmsCategories.slug,
        lang: cmsCategories.lang,
        title: cmsCategories.title,
        content: cmsCategories.content,
        icon: cmsCategories.icon,
        metaDescription: cmsCategories.metaDescription,
        seoTitle: cmsCategories.seoTitle,
        order: cmsCategories.order,
        publishedAt: cmsCategories.publishedAt,
        createdAt: cmsCategories.createdAt,
        updatedAt: cmsCategories.updatedAt,
      })
      .from(cmsCategories)
      .where(and(...conditions))
      .limit(1);

    if (!category) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: apiHeaders() },
      );
    }

    return { data: category };
  });
}
