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

const _contentQueue = createQueue('content-publish');

/** Initialize content publish worker. */
export function startContentPublishWorker(): void {
  createWorker('content-publish', async () => {
    await processScheduledContent();
  });
}
