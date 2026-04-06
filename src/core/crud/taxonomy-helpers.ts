import { and, eq, inArray } from 'drizzle-orm';

import type { DbClient } from '@/server/db';
import { cmsTermRelationships, cmsTerms } from '@/server/db/schema';

/**
 * Sync term relationships for a given object + taxonomy.
 * Deletes all existing relationships for the object+taxonomy, then inserts the new ones.
 * Pass empty array to remove all relationships.
 */
export async function syncTermRelationships(
  db: DbClient,
  objectId: string,
  taxonomyId: string,
  termIds: string[]
): Promise<void> {
  await db
    .delete(cmsTermRelationships)
    .where(
      and(
        eq(cmsTermRelationships.objectId, objectId),
        eq(cmsTermRelationships.taxonomyId, taxonomyId)
      )
    );

  if (termIds.length > 0) {
    await db.insert(cmsTermRelationships).values(
      termIds.map((termId) => ({
        objectId,
        termId,
        taxonomyId,
      }))
    );
  }
}

/**
 * Get term IDs for a given object, optionally filtered by taxonomy.
 */
export async function getTermRelationships(
  db: DbClient,
  objectId: string,
  taxonomyId?: string
): Promise<{ termId: string; taxonomyId: string }[]> {
  const conditions = [eq(cmsTermRelationships.objectId, objectId)];
  if (taxonomyId) {
    conditions.push(eq(cmsTermRelationships.taxonomyId, taxonomyId));
  }

  return db
    .select({
      termId: cmsTermRelationships.termId,
      taxonomyId: cmsTermRelationships.taxonomyId,
    })
    .from(cmsTermRelationships)
    .where(and(...conditions));
}

/**
 * Delete all term relationships for a given object (used on permanent delete).
 */
export async function deleteAllTermRelationships(
  db: DbClient,
  objectId: string
): Promise<void> {
  await db
    .delete(cmsTermRelationships)
    .where(eq(cmsTermRelationships.objectId, objectId));
}

/**
 * Delete all term relationships pointing to a specific term.
 */
export async function deleteTermRelationshipsByTerm(
  db: DbClient,
  termId: string,
  taxonomyId: string
): Promise<void> {
  await db
    .delete(cmsTermRelationships)
    .where(
      and(
        eq(cmsTermRelationships.termId, termId),
        eq(cmsTermRelationships.taxonomyId, taxonomyId)
      )
    );
}

/**
 * Get object IDs that have a specific term assigned.
 */
export async function getObjectIdsForTerm(
  db: DbClient,
  termId: string,
  taxonomyId: string,
  limit = 100
): Promise<string[]> {
  const rows = await db
    .select({ objectId: cmsTermRelationships.objectId })
    .from(cmsTermRelationships)
    .where(
      and(
        eq(cmsTermRelationships.termId, termId),
        eq(cmsTermRelationships.taxonomyId, taxonomyId)
      )
    )
    .limit(limit);

  return rows.map((r) => r.objectId);
}

/**
 * Batch-fetch term relationships for multiple objects.
 */
export async function batchGetTermRelationships(
  db: DbClient,
  objectIds: string[],
  taxonomyId: string
): Promise<Map<string, string[]>> {
  if (objectIds.length === 0) return new Map();

  const rows = await db
    .select({
      objectId: cmsTermRelationships.objectId,
      termId: cmsTermRelationships.termId,
    })
    .from(cmsTermRelationships)
    .where(
      and(
        inArray(cmsTermRelationships.objectId, objectIds),
        eq(cmsTermRelationships.taxonomyId, taxonomyId)
      )
    );

  const result = new Map<string, string[]>();
  for (const row of rows) {
    const existing = result.get(row.objectId);
    if (existing) {
      existing.push(row.termId);
    } else {
      result.set(row.objectId, [row.termId]);
    }
  }
  return result;
}

/**
 * Resolve tags for an array of posts.
 * Returns the same array with a `.tags` array appended to each post.
 */
export async function resolveTagsForPosts<
  T extends { id: string },
>(
  db: DbClient,
  posts: T[]
): Promise<(T & { tags: { id: string; name: string; slug: string }[] })[]> {
  if (posts.length === 0) return [];

  const postIds = posts.map((p) => p.id);
  const tagMap = await batchGetTermRelationships(db, postIds, 'tag');

  // Collect all unique tag IDs
  const allTagIds = new Set<string>();
  for (const ids of tagMap.values()) {
    for (const id of ids) allTagIds.add(id);
  }

  // Batch-fetch tag info
  let tagInfoMap = new Map<string, { id: string; name: string; slug: string }>();
  if (allTagIds.size > 0) {
    const tagRows = await db
      .select({ id: cmsTerms.id, name: cmsTerms.name, slug: cmsTerms.slug })
      .from(cmsTerms)
      .where(inArray(cmsTerms.id, [...allTagIds]))
      .limit(500);
    tagInfoMap = new Map(tagRows.map((t) => [t.id, t]));
  }

  return posts.map((post) => {
    const tagIds = tagMap.get(post.id) ?? [];
    const tags = tagIds
      .map((id) => tagInfoMap.get(id))
      .filter((t): t is { id: string; name: string; slug: string } => !!t);
    return { ...post, tags };
  });
}
