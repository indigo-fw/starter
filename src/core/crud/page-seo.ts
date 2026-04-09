import { and, eq, isNull, type SQL } from 'drizzle-orm';

import type { DbClient } from '@/server/db';
import { cmsPosts } from '@/server/db/schema';
import { ContentStatus, PostType } from '@/core/types/cms';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodedRouteSEO {
  seoTitle: string | null;
  metaDescription: string | null;
  noindex: boolean;
  jsonLd: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get CMS SEO override for a coded route (homepage, blog list, etc.).
 *
 * Looks for a published cms_posts entry with type=PAGE matching the slug.
 * Returns SEO fields only — use publishedPageWhere() to build custom queries
 * that select additional columns (content, perex, etc.).
 */
export async function getCodedRouteSEO(
  db: DbClient,
  slug: string,
  lang: string
): Promise<CodedRouteSEO | null> {
  const [post] = await db
    .select({
      seoTitle: cmsPosts.seoTitle,
      metaDescription: cmsPosts.metaDescription,
      noindex: cmsPosts.noindex,
      jsonLd: cmsPosts.jsonLd,
    })
    .from(cmsPosts)
    .where(publishedPageWhere(slug, lang))
    .limit(1);

  return post ?? null;
}

/**
 * WHERE clause for a published CMS page override.
 *
 * Exported so projects can build custom queries that select additional columns
 * (content, perex, featured_image, etc.) without duplicating the filter logic.
 *
 * ```ts
 * // Project-layer example:
 * const [post] = await db
 *   .select({ content: cmsPosts.content, perex: cmsPosts.perex })
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
