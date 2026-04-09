import type { DbClient } from '@/server/db';
import { cmsPosts } from '@/server/db/schema';
import { getCodedRouteSEO, publishedPageWhere } from '@/core/crud/page-seo';
import type { CodedRouteSEO } from '@/core/crud/page-seo';

/**
 * Project-level CMS override for coded routes.
 *
 * Returns SEO metadata + body fields (content) in a single DB query.
 * Extend this with additional columns (perex, featured_image, etc.)
 * as your project needs — core stays untouched.
 *
 * Uses getCodedRouteSEO() for the SEO part and publishedPageWhere()
 * from core for the WHERE clause, so filter logic is never duplicated.
 */

export interface CmsOverride {
  seo: CodedRouteSEO;
  content: string | null;
}

export async function getCmsOverride(
  db: DbClient,
  slug: string,
  lang: string
): Promise<CmsOverride | null> {
  const [post] = await db
    .select({
      seoTitle: cmsPosts.seoTitle,
      metaDescription: cmsPosts.metaDescription,
      noindex: cmsPosts.noindex,
      jsonLd: cmsPosts.jsonLd,
      content: cmsPosts.content,
    })
    .from(cmsPosts)
    .where(publishedPageWhere(slug, lang))
    .limit(1);

  if (!post) return null;

  const { content, ...seo } = post;
  return { seo, content: content || null };
}
