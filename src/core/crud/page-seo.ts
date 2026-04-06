import { and, eq, isNull } from 'drizzle-orm';

import type { DbClient } from '@/server/db';
import { cmsPosts } from '@/server/db/schema';
import { ContentStatus, PostType } from '@/core/types/cms';

export async function getCodedRouteSEO(
  db: DbClient,
  slug: string,
  lang: string
) {
  const [post] = await db
    .select({
      seoTitle: cmsPosts.seoTitle,
      metaDescription: cmsPosts.metaDescription,
      noindex: cmsPosts.noindex,
      jsonLd: cmsPosts.jsonLd,
    })
    .from(cmsPosts)
    .where(
      and(
        eq(cmsPosts.type, PostType.PAGE),
        eq(cmsPosts.slug, slug),
        eq(cmsPosts.lang, lang),
        eq(cmsPosts.status, ContentStatus.PUBLISHED),
        isNull(cmsPosts.deletedAt)
      )
    )
    .limit(1);

  return post ?? null;
}
