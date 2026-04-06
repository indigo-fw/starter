import { desc, eq, and } from 'drizzle-orm';

import type { DbClient } from '@/server/db';
import { cmsContentRevisions } from '@/server/db/schema';
import type { ContentSnapshot } from '@/core/types/cms';

/**
 * Create a content revision snapshot.
 */
export async function createRevision(
  db: DbClient,
  contentType: string,
  contentId: string,
  snapshot: ContentSnapshot,
  createdBy?: string
): Promise<void> {
  await db.insert(cmsContentRevisions).values({
    contentType,
    contentId,
    snapshot,
    createdBy: createdBy ?? null,
  });
}

/**
 * List revisions for a content item, newest first.
 */
export async function getRevisions(
  db: DbClient,
  contentType: string,
  contentId: string,
  limit = 50
) {
  return db
    .select()
    .from(cmsContentRevisions)
    .where(
      and(
        eq(cmsContentRevisions.contentType, contentType),
        eq(cmsContentRevisions.contentId, contentId)
      )
    )
    .orderBy(desc(cmsContentRevisions.createdAt))
    .limit(limit);
}

/**
 * Pick fields from a record to create a snapshot.
 */
export function pickSnapshot<T extends Record<string, unknown>>(
  record: T,
  keys: (keyof T)[]
): ContentSnapshot {
  const snapshot: ContentSnapshot = {};
  for (const key of keys) {
    snapshot[key as string] = record[key];
  }
  return snapshot;
}
