import { createRevision, pickSnapshot } from './content-revisions';

import type { DbClient } from '@/server/db';
import { cmsSlugRedirects } from '@/server/db/schema';

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
  /** The actual update callback — receives the transaction client */
  doUpdate: (db: DbClient) => Promise<void>;
}

/**
 * Snapshot the old record as a revision, record a slug redirect when the slug
 * changed, then run the caller's update — all inside ONE transaction. A
 * failure in `doUpdate` must not leave an orphan revision row or a redirect
 * pointing at a slug that was never actually renamed.
 */
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

  const snapshot = pickSnapshot(oldRecord, snapshotKeys);

  await db.transaction(async (tx) => {
    await createRevision(tx, contentType, contentId, snapshot, userId);

    if (oldSlug && newSlug && oldSlug !== newSlug && urlPrefix != null) {
      await tx.insert(cmsSlugRedirects).values({
        oldSlug,
        contentType,
        contentId,
        urlPrefix,
      });
    }

    await doUpdate(tx);
  });
}
