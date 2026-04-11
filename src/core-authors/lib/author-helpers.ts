/**
 * Helpers for managing author relationships and lookups.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';

import { cmsAuthors, cmsAuthorRelationships } from '../schema/authors';
import type { DbClient } from '@/server/db';

/**
 * Replace all authors for an object (post, portfolio item, etc.).
 * Order preserved from array index.
 */
export async function syncAuthorRelationships(
  db: DbClient,
  objectId: string,
  contentType: string,
  authorIds: string[],
): Promise<void> {
  await db
    .delete(cmsAuthorRelationships)
    .where(
      and(
        eq(cmsAuthorRelationships.objectId, objectId),
        eq(cmsAuthorRelationships.contentType, contentType),
      ),
    );

  if (authorIds.length > 0) {
    await db.insert(cmsAuthorRelationships).values(
      authorIds.map((authorId, i) => ({
        objectId,
        authorId,
        contentType,
        order: i,
      })),
    );
  }
}

/**
 * Get ordered author IDs for an object (admin form).
 */
export async function getAuthorIds(
  db: DbClient,
  objectId: string,
  contentType: string,
): Promise<string[]> {
  const rows = await db
    .select({ authorId: cmsAuthorRelationships.authorId })
    .from(cmsAuthorRelationships)
    .where(
      and(
        eq(cmsAuthorRelationships.objectId, objectId),
        eq(cmsAuthorRelationships.contentType, contentType),
      ),
    )
    .orderBy(asc(cmsAuthorRelationships.order));

  return rows.map((r) => r.authorId);
}

/**
 * Get ordered author profiles for an object (frontend rendering).
 */
export async function getAuthorsForObject(
  db: DbClient,
  objectId: string,
  contentType: string,
): Promise<{ id: string; name: string; slug: string; avatar: string | null }[]> {
  return db
    .select({
      id: cmsAuthors.id,
      name: cmsAuthors.name,
      slug: cmsAuthors.slug,
      avatar: cmsAuthors.avatar,
    })
    .from(cmsAuthorRelationships)
    .innerJoin(cmsAuthors, eq(cmsAuthorRelationships.authorId, cmsAuthors.id))
    .where(
      and(
        eq(cmsAuthorRelationships.objectId, objectId),
        eq(cmsAuthorRelationships.contentType, contentType),
      ),
    )
    .orderBy(asc(cmsAuthorRelationships.order));
}

/**
 * Batch get authors for multiple objects (avoids N+1 on list pages).
 */
export async function batchGetAuthorsForObjects(
  db: DbClient,
  objectIds: string[],
  contentType: string,
): Promise<Map<string, { id: string; name: string; slug: string }[]>> {
  if (objectIds.length === 0) return new Map();

  const rows = await db
    .select({
      objectId: cmsAuthorRelationships.objectId,
      id: cmsAuthors.id,
      name: cmsAuthors.name,
      slug: cmsAuthors.slug,
    })
    .from(cmsAuthorRelationships)
    .innerJoin(cmsAuthors, eq(cmsAuthorRelationships.authorId, cmsAuthors.id))
    .where(
      and(
        inArray(cmsAuthorRelationships.objectId, objectIds),
        eq(cmsAuthorRelationships.contentType, contentType),
      ),
    )
    .orderBy(asc(cmsAuthorRelationships.order));

  const map = new Map<string, { id: string; name: string; slug: string }[]>();
  for (const row of rows) {
    const authors = map.get(row.objectId) ?? [];
    authors.push({ id: row.id, name: row.name, slug: row.slug });
    map.set(row.objectId, authors);
  }
  return map;
}
