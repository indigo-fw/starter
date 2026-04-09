import { and, eq, isNull, type SQL } from 'drizzle-orm';

import { cmsPosts } from '@/server/db/schema';
import { ContentStatus, PostType } from '@/core/types/cms';

/**
 * WHERE clause for a published CMS page override (type=PAGE, published, not deleted).
 *
 * This is the only piece core owns — projects build their own queries on top,
 * selecting whatever columns they need (SEO fields, content, perex, etc.).
 *
 * ```ts
 * // Project-layer getCmsOverride example:
 * const [post] = await db
 *   .select({ seoTitle: cmsPosts.seoTitle, content: cmsPosts.content })
 *   .from(cmsPosts)
 *   .where(publishedPageWhere(slug, lang))
 *   .limit(1);
 * ```
 */
export function publishedPageWhere(slug: string, lang: string): SQL {
  return and(
    eq(cmsPosts.type, PostType.PAGE),
    eq(cmsPosts.slug, slug),
    eq(cmsPosts.lang, lang),
    eq(cmsPosts.status, ContentStatus.PUBLISHED),
    isNull(cmsPosts.deletedAt)
  )!;
}
