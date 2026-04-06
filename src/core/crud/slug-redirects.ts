import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/server/db';
import { cmsCategories, cmsPosts, cmsSlugRedirects } from '@/server/db/schema';

/**
 * Look up a slug redirect and resolve to the content's current slug.
 * Returns the full path (urlPrefix + currentSlug) if found, null otherwise.
 *
 * Stores content_id so A→B→C all resolve to the current slug — no chain-following.
 */
export async function resolveSlugRedirect(
  slug: string,
  urlPrefix: string
): Promise<string | null> {
  const redirect = await db.query.cmsSlugRedirects.findFirst({
    where: and(
      eq(cmsSlugRedirects.oldSlug, slug),
      eq(cmsSlugRedirects.urlPrefix, urlPrefix)
    ),
    orderBy: desc(cmsSlugRedirects.createdAt),
    columns: {
      contentType: true,
      contentId: true,
    },
  });

  if (!redirect) return null;

  let currentSlug: string | null = null;

  if (redirect.contentType === 'category') {
    const cat = await db.query.cmsCategories.findFirst({
      where: and(
        eq(cmsCategories.id, redirect.contentId),
        isNull(cmsCategories.deletedAt)
      ),
      columns: { slug: true },
    });
    currentSlug = cat?.slug ?? null;
  } else {
    // All post-backed types share cmsPosts
    const post = await db.query.cmsPosts.findFirst({
      where: and(
        eq(cmsPosts.id, redirect.contentId),
        isNull(cmsPosts.deletedAt)
      ),
      columns: { slug: true },
    });
    currentSlug = post?.slug ?? null;
  }

  if (!currentSlug || currentSlug === slug) return null;

  return `${urlPrefix}${currentSlug}`;
}
