import { and, desc, eq, inArray } from 'drizzle-orm';

import type { ContentSnapshot } from '@/core/types/cms';
import type { DbClient } from '@/server/db';
import { cmsContentRevisions } from '@/server/db/schema';

/**
 * Revisions kept per entity. Every update snapshots the previous state, so a
 * busy page would otherwise accumulate thousands of jsonb rows with no eviction.
 */
export const MAX_REVISIONS = 50;

/** Largest prune per call — keeps a one-off backlog from turning into a huge DELETE. */
const PRUNE_BATCH = 1000;

/**
 * Create a content revision snapshot, then drop anything past MAX_REVISIONS for
 * the same entity. Both run on the client passed in, so inside
 * `updateWithRevision` the prune shares the update's transaction.
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

  // Rows ranked newest-first; everything from position MAX_REVISIONS on is
  // surplus. The id tiebreak keeps same-timestamp rows from reordering between
  // the ranking subquery and later reads. Single statement — no extra round trip.
  const surplus = db
    .select({ id: cmsContentRevisions.id })
    .from(cmsContentRevisions)
    .where(
      and(
        eq(cmsContentRevisions.contentType, contentType),
        eq(cmsContentRevisions.contentId, contentId)
      )
    )
    .orderBy(desc(cmsContentRevisions.createdAt), desc(cmsContentRevisions.id))
    .offset(MAX_REVISIONS)
    .limit(PRUNE_BATCH);

  await db
    .delete(cmsContentRevisions)
    .where(inArray(cmsContentRevisions.id, surplus));
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
