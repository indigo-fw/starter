import { cache } from 'react';

import type { DbClient } from '@/server/db';
import { cmsPosts } from '@/server/db/schema';
import { publishedPageWhere } from '@/core/crud/page-seo';

/**
 * Project-level CMS override for coded routes.
 *
 * Single function for both generateMetadata() and page render — React cache()
 * deduplicates within a request, so only one DB query is made per page load.
 *
 * Extend with additional columns (perex, featured_image, etc.) as needed.
 * Core is never modified — just add columns to the select and the interface.
 */

export interface CmsOverrideSEO {
  seoTitle: string | null;
  metaDescription: string | null;
  noindex: boolean;
  jsonLd: string | null;
}

export interface CmsOverride {
  seo: CmsOverrideSEO;
  content: string | null;
}

export const getCmsOverride = cache(async (
  db: DbClient,
  slug: string,
  lang: string
): Promise<CmsOverride | null> => {
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
});
