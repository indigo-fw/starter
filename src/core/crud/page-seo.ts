import { and, eq, isNull } from 'drizzle-orm';

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

export interface CmsOverride {
  seo: CodedRouteSEO;
  content: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get CMS SEO override for a coded route (homepage, blog list, etc.).
 *
 * Looks for a published cms_posts entry with type=PAGE matching the slug.
 * Returns SEO fields only — use getCmsOverride() when you also need body content.
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

/**
 * Unified CMS override for coded routes — returns SEO metadata + body content
 * in a single DB query.
 *
 * Use this in coded route page components where you need both the SEO H1/title
 * and optional markdown body content for SEO copy.
 *
 * No built-in caching — projects can wrap with their own cache layer
 * (React.cache, unstable_cache, or custom in-memory cache) as needed.
 */
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

  if (!post) return null;

  const { content, ...seo } = post;
  return { seo, content: content || null };
}
