import { db } from '@/server/db';
import { cmsPosts, cmsCategories, cmsPortfolio, cmsShowcase } from '@/server/db/schema';
import { eq, and, ne, isNull } from 'drizzle-orm';
import { ContentStatus } from '@/core/types/cms';

/** Walk up the parent chain to build a breadcrumb trail. */
export async function getAncestors(postId: string): Promise<{ title: string; slug: string }[]> {
  const ancestors: { title: string; slug: string }[] = [];
  let currentId: string | null = postId;
  const seen = new Set<string>();

  while (currentId && ancestors.length < 10) {
    if (seen.has(currentId)) break;
    seen.add(currentId);

    const [row] = await db
      .select({
        parentId: cmsPosts.parentId,
        title: cmsPosts.title,
        slug: cmsPosts.slug,
      })
      .from(cmsPosts)
      .where(
        and(
          eq(cmsPosts.id, currentId),
          eq(cmsPosts.status, ContentStatus.PUBLISHED),
          isNull(cmsPosts.deletedAt)
        )
      )
      .limit(1);

    if (!row?.parentId) break;

    const [parent] = await db
      .select({ id: cmsPosts.id, title: cmsPosts.title, slug: cmsPosts.slug })
      .from(cmsPosts)
      .where(
        and(
          eq(cmsPosts.id, row.parentId),
          eq(cmsPosts.status, ContentStatus.PUBLISHED),
          isNull(cmsPosts.deletedAt)
        )
      )
      .limit(1);

    if (!parent) break;
    ancestors.unshift({ title: parent.title, slug: parent.slug });
    currentId = parent.id;
  }

  return ancestors;
}

/** Get translation siblings for a post via its translationGroup. */
export async function getPostTranslationSiblings(postId: string) {
  try {
    const [post] = await db
      .select({ translationGroup: cmsPosts.translationGroup })
      .from(cmsPosts)
      .where(eq(cmsPosts.id, postId))
      .limit(1);

    if (!post?.translationGroup) return [];

    return await db
      .select({ lang: cmsPosts.lang, slug: cmsPosts.slug })
      .from(cmsPosts)
      .where(
        and(
          eq(cmsPosts.translationGroup, post.translationGroup),
          ne(cmsPosts.id, postId),
          eq(cmsPosts.status, ContentStatus.PUBLISHED),
          isNull(cmsPosts.deletedAt)
        )
      )
      .limit(20);
  } catch {
    return [];
  }
}

/** Get translation siblings for a category via its translationGroup. */
export async function getCategoryTranslationSiblings(catId: string) {
  try {
    const [cat] = await db
      .select({ translationGroup: cmsCategories.translationGroup })
      .from(cmsCategories)
      .where(eq(cmsCategories.id, catId))
      .limit(1);

    if (!cat?.translationGroup) return [];

    return await db
      .select({ lang: cmsCategories.lang, slug: cmsCategories.slug })
      .from(cmsCategories)
      .where(
        and(
          eq(cmsCategories.translationGroup, cat.translationGroup),
          ne(cmsCategories.id, catId),
          eq(cmsCategories.status, ContentStatus.PUBLISHED),
          isNull(cmsCategories.deletedAt)
        )
      )
      .limit(20);
  } catch {
    return [];
  }
}

/** Get translation siblings for a showcase item via its translationGroup. */
export async function getShowcaseTranslationSiblings(itemId: string) {
  try {
    const [item] = await db
      .select({ translationGroup: cmsShowcase.translationGroup })
      .from(cmsShowcase)
      .where(eq(cmsShowcase.id, itemId))
      .limit(1);

    if (!item?.translationGroup) return [];

    return await db
      .select({ lang: cmsShowcase.lang, slug: cmsShowcase.slug })
      .from(cmsShowcase)
      .where(
        and(
          eq(cmsShowcase.translationGroup, item.translationGroup),
          ne(cmsShowcase.id, itemId),
          eq(cmsShowcase.status, ContentStatus.PUBLISHED),
          isNull(cmsShowcase.deletedAt)
        )
      )
      .limit(20);
  } catch {
    return [];
  }
}

/** Get translation siblings for a portfolio item via its translationGroup. */
export async function getPortfolioTranslationSiblings(itemId: string) {
  try {
    const [item] = await db
      .select({ translationGroup: cmsPortfolio.translationGroup })
      .from(cmsPortfolio)
      .where(eq(cmsPortfolio.id, itemId))
      .limit(1);

    if (!item?.translationGroup) return [];

    return await db
      .select({ lang: cmsPortfolio.lang, slug: cmsPortfolio.slug })
      .from(cmsPortfolio)
      .where(
        and(
          eq(cmsPortfolio.translationGroup, item.translationGroup),
          ne(cmsPortfolio.id, itemId),
          eq(cmsPortfolio.status, ContentStatus.PUBLISHED),
          isNull(cmsPortfolio.deletedAt)
        )
      )
      .limit(20);
  } catch {
    return [];
  }
}
