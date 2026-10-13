/**
 * Scheduled content publisher — modules/project register content types
 * that support scheduled publishing, core processes them.
 */

import { createQueue, createWorker } from '../infra/queue';
import { logAudit } from '../infra/audit';
import { dispatchWebhook } from '../webhooks/webhooks';
import { createLogger } from '../infra/logger';
import { db } from '@/server/db';

const logger = createLogger('scheduled-publish');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduledPublishTarget {
  /** Display name (e.g. 'posts', 'categories') */
  name: string;
  /** Entity type for audit log (e.g. 'post', 'category') */
  entityType: string;
  /** Webhook event prefix (e.g. 'post' → 'post.published') */
  webhookEventPrefix: string;
  /** Find all scheduled entries ready to publish. Extra fields are included in webhook payload. */
  findScheduled: () => Promise<Array<{ id: string; title: string; [key: string]: unknown }>>;
  /** Update a single entry to published status */
  publish: (id: string) => Promise<void>;
  /** Optional: called after each entry is published (e.g. send notification, invalidate cache) */
  onPublished?: (entry: { id: string; title: string; [key: string]: unknown }) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const targets: ScheduledPublishTarget[] = [];

/** Register a content type for scheduled publishing. */
export function registerScheduledPublishTarget(target: ScheduledPublishTarget): void {
  targets.push(target);
}

// ---------------------------------------------------------------------------
// Processor
// ---------------------------------------------------------------------------

/** Process all registered targets, publishing scheduled entries. */
export async function processScheduledContent(): Promise<void> {
  for (const target of targets) {
    const entries = await target.findScheduled();

    for (const entry of entries) {
      await target.publish(entry.id);

      logAudit({
        db,
        userId: 'system',
        action: 'publish',
        entityType: target.entityType,
        entityId: entry.id,
        entityTitle: entry.title,
        metadata: { auto: true },
      });

      dispatchWebhook(db, `${target.webhookEventPrefix}.published`, entry);

      if (target.onPublished) {
        try {
          await target.onPublished(entry);
        } catch (err) {
          logger.error(`onPublished hook failed for ${target.name}:${entry.id}`, { error: String(err) });
        }
      }
    }

    if (entries.length > 0) {
      logger.info(`Auto-published ${entries.length} ${target.name}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

/**
 * Repeatable-job definition. Single source of truth: the worker arms it at
 * start and `src/scripts/schedule-jobs.ts` re-arms it by hand — neither
 * duplicates the id/interval.
 */
export const CONTENT_PUBLISH_SCHEDULE = {
  queue: 'content-publish',
  schedulerId: 'content-publish',
  everyMs: 60_000,
} as const;

const _contentQueue = createQueue(CONTENT_PUBLISH_SCHEDULE.queue);

/**
 * Idempotently register the repeatable job. Resolves false when Redis is
 * absent (no queue), so callers can report "skipped" rather than "armed".
 */
export async function ensureContentPublishSchedule(): Promise<boolean> {
  if (!_contentQueue) return false;
  await _contentQueue.upsertJobScheduler(CONTENT_PUBLISH_SCHEDULE.schedulerId, {
    every: CONTENT_PUBLISH_SCHEDULE.everyMs,
  });
  return true;
}

/** Initialize content publish worker. */
export function startContentPublishWorker(): void {
  // Self-register so a fresh deploy publishes scheduled content without a
  // manual scheduling step. Non-fatal: the worker still consumes jobs armed
  // earlier (or by schedule-jobs.ts) if the upsert itself fails.
  ensureContentPublishSchedule().catch((err: unknown) => {
    logger.warn('Failed to register content-publish schedule', { error: String(err) });
  });

  createWorker(CONTENT_PUBLISH_SCHEDULE.queue, async () => {
    await processScheduledContent();
  });
}
