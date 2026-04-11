/**
 * Helpers for managing the cms_post_authors junction table.
 * Follows the same delete-then-insert pattern as syncTermRelationships.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';

import { cmsPostAuthors } from '@/server/db/schema/post-authors';
import { user } from '@/server/db/schema/auth';
import type { DbClient } from '@/server/db';

/**
 * Replace all public authors for a post with the given user IDs.
 * Order is preserved from the array index.
 */
export async function syncPostAuthors(
  db: DbClient,
  postId: string,
  userIds: string[],
): Promise<void> {
  await db
    .delete(cmsPostAuthors)
    .where(eq(cmsPostAuthors.postId, postId));

  if (userIds.length > 0) {
    await db.insert(cmsPostAuthors).values(
      userIds.map((userId, i) => ({
        postId,
        userId,
        order: i,
      })),
    );
  }
}

/**
 * Get ordered author user IDs for a post.
 */
export async function getPostAuthorIds(
  db: DbClient,
  postId: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: cmsPostAuthors.userId })
    .from(cmsPostAuthors)
    .where(eq(cmsPostAuthors.postId, postId))
    .orderBy(asc(cmsPostAuthors.order));

  return rows.map((r) => r.userId);
}

/**
 * Get ordered author names for a post (public frontend use).
 */
export async function getPostAuthorNames(
  db: DbClient,
  postId: string,
): Promise<string[]> {
  const rows = await db
    .select({ name: user.name, order: cmsPostAuthors.order })
    .from(cmsPostAuthors)
    .innerJoin(user, eq(cmsPostAuthors.userId, user.id))
    .where(eq(cmsPostAuthors.postId, postId))
    .orderBy(asc(cmsPostAuthors.order));

  return rows.map((r) => r.name);
}

/**
 * Batch get author names for multiple posts (avoids N+1).
 */
export async function batchGetPostAuthorNames(
  db: DbClient,
  postIds: string[],
): Promise<Map<string, string[]>> {
  if (postIds.length === 0) return new Map();

  const rows = await db
    .select({
      postId: cmsPostAuthors.postId,
      name: user.name,
      order: cmsPostAuthors.order,
    })
    .from(cmsPostAuthors)
    .innerJoin(user, eq(cmsPostAuthors.userId, user.id))
    .where(inArray(cmsPostAuthors.postId, postIds))
    .orderBy(asc(cmsPostAuthors.order));

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const names = map.get(row.postId) ?? [];
    names.push(row.name);
    map.set(row.postId, names);
  }
  return map;
}
