import type { DbClient } from '@/server/db';
import { cmsSlugRedirects } from '@/server/db/schema';
import { createRevision, pickSnapshot } from './content-revisions';

// ---------------------------------------------------------------------------
// updateWithRevision — wraps revision + slug redirect + update in transaction
// ---------------------------------------------------------------------------

export interface UpdateWithRevisionOpts<T extends Record<string, unknown>> {
  db: DbClient;
  contentType: string;
  contentId: string;
  oldRecord: T;
  snapshotKeys: (keyof T)[];
  userId?: string;
  /** Old slug — if changed, creates a redirect */
  oldSlug?: string;
  /** New slug — compared with oldSlug to detect changes */
  newSlug?: string;
  /** URL prefix for redirect (e.g. '/blog/') */
  urlPrefix?: string;
  /** The actual update callback */
  doUpdate: (db: DbClient) => Promise<void>;
}

export async function updateWithRevision<T extends Record<string, unknown>>(
  opts: UpdateWithRevisionOpts<T>
): Promise<void> {
  const {
    db,
    contentType,
    contentId,
    oldRecord,
    snapshotKeys,
    userId,
    oldSlug,
    newSlug,
    urlPrefix,
    doUpdate,
  } = opts;

  // Create revision snapshot
  const snapshot = pickSnapshot(oldRecord, snapshotKeys);
  await createRevision(db, contentType, contentId, snapshot, userId);

  // Slug redirect if slug changed
  if (oldSlug && newSlug && oldSlug !== newSlug && urlPrefix != null) {
    await db.insert(cmsSlugRedirects).values({
      oldSlug,
      contentType,
      contentId,
      urlPrefix,
    });
  }

  // Execute the update
  await doUpdate(db);
}
