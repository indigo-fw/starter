import { and, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm';

import { createLogger } from '@/core/lib/infra/logger';
import { registerMaintenanceTask } from '@/core/lib/infra/maintenance';
import { getStorage } from '@/core/storage';
import { db } from '@/server/db';
// core-payments is a required module (see src/core/AGENTS.md), so its
// idempotency table is always present; imported via the schema barrel like
// the webhook routes do.
import { saasSubscriptionEvents } from '@/server/db/schema';
import { cmsAuditLog } from '@/server/db/schema/audit';
import { session, user } from '@/server/db/schema/auth';
import { cmsCategories } from '@/server/db/schema/categories';
import { cmsPostAttachments, cmsPosts } from '@/server/db/schema/cms';
import { cmsMedia } from '@/server/db/schema/media';
import { saasNotifications } from '@/server/db/schema/notifications';
import { saasPushSubscriptions } from '@/server/db/schema/push-subscriptions';
import { saasTaskQueue } from '@/server/db/schema/task-queue';

const log = createLogger('maintenance');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;

async function cleanupOrphanedMedia(): Promise<void> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
  const staleMedia = await db
    .select({
      id: cmsMedia.id,
      filepath: cmsMedia.filepath,
      thumbnailPath: cmsMedia.thumbnailPath,
      mediumPath: cmsMedia.mediumPath,
    })
    .from(cmsMedia)
    .where(and(isNotNull(cmsMedia.deletedAt), lte(cmsMedia.deletedAt, cutoff)))
    .limit(BATCH_SIZE);

  if (staleMedia.length === 0) return;
  const storage = getStorage();

  // Filepaths in this batch that ANOTHER media row (live or trashed) still
  // points at — duplicates/re-uploads can share a stored file. Deleting the
  // blob for one row would destroy the image its sibling still serves; the
  // file is collected when its LAST row is purged, so nothing leaks. One
  // GROUP BY per batch instead of one lookup per row.
  const batchPaths = staleMedia
    .map((m) => m.filepath)
    .filter((p): p is string => !!p);
  const sharedPaths = new Set<string>();
  if (batchPaths.length > 0) {
    const counts = await db
      .select({
        filepath: cmsMedia.filepath,
        n: sql<number>`count(*)`.mapWith(Number),
      })
      .from(cmsMedia)
      .where(inArray(cmsMedia.filepath, batchPaths))
      .groupBy(cmsMedia.filepath);
    for (const row of counts) {
      if (row.n > 1 && row.filepath) sharedPaths.add(row.filepath);
    }
  }

  let filesKept = 0;
  for (const media of staleMedia) {
    if (media.filepath && sharedPaths.has(media.filepath)) {
      filesKept++;
      continue; // row goes, file stays — a sibling row still serves it
    }
    const paths = [
      media.filepath,
      media.thumbnailPath,
      media.mediumPath,
    ].filter(Boolean) as string[];
    for (const p of paths) {
      try {
        await storage.delete(p);
      } catch {
        /* File may already be gone */
      }
    }
  }
  if (filesKept > 0)
    log.info(
      `Kept ${filesKept} storage files still referenced by other media rows`
    );

  const ids = staleMedia.map((m) => m.id);
  await db.delete(cmsMedia).where(inArray(cmsMedia.id, ids));
  log.info(`Cleaned up ${staleMedia.length} orphaned media files`);
}

async function cleanupExpiredSessions(): Promise<void> {
  const result = await db
    .delete(session)
    .where(lt(session.expiresAt, new Date()))
    .returning({ id: session.id });
  if (result.length > 0)
    log.info(`Cleaned up ${result.length} expired sessions`);
}

async function cleanupOldAuditLogs(): Promise<void> {
  const { infraConfig } = await import('@/config/infra');
  const envOverride = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS ?? '0', 10);
  const retentionDays =
    envOverride > 0 ? envOverride : infraConfig.audit.retentionDays;
  if (!retentionDays || retentionDays <= 0) return;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  let totalDeleted = 0;
  let batch: { id: string }[];
  do {
    batch = await db
      .delete(cmsAuditLog)
      .where(lt(cmsAuditLog.createdAt, cutoff))
      .returning({ id: cmsAuditLog.id });
    totalDeleted += batch.length;
  } while (batch.length >= 1000);

  if (totalDeleted > 0)
    log.info(
      `Cleaned up ${totalDeleted} old audit logs (retention: ${retentionDays}d)`
    );
}

async function cleanupExpiredNotifications(): Promise<void> {
  const result = await db
    .delete(saasNotifications)
    .where(
      and(
        isNotNull(saasNotifications.expiresAt),
        lt(saasNotifications.expiresAt, new Date())
      )
    )
    .returning({ id: saasNotifications.id });
  if (result.length > 0)
    log.info(`Cleaned up ${result.length} expired notifications`);
}

async function cleanupDeadTasks(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(saasTaskQueue)
    .where(
      and(
        inArray(saasTaskQueue.status, ['completed', 'dead']),
        lt(saasTaskQueue.updatedAt, cutoff)
      )
    )
    .returning({ id: saasTaskQueue.id });
  if (result.length > 0)
    log.info(`Cleaned up ${result.length} dead/completed queue tasks`);
}

async function permanentDeleteTrash(): Promise<void> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);

  const trashedPosts = await db
    .select({ id: cmsPosts.id })
    .from(cmsPosts)
    .where(and(isNotNull(cmsPosts.deletedAt), lte(cmsPosts.deletedAt, cutoff)))
    .limit(BATCH_SIZE);

  if (trashedPosts.length > 0) {
    const postIds = trashedPosts.map((p) => p.id);
    await db
      .delete(cmsPostAttachments)
      .where(inArray(cmsPostAttachments.postId, postIds));
    await db.delete(cmsPosts).where(inArray(cmsPosts.id, postIds));
    log.info(`Permanently deleted ${trashedPosts.length} trashed posts`);
  }

  const trashedCategories = await db
    .select({ id: cmsCategories.id })
    .from(cmsCategories)
    .where(
      and(
        isNotNull(cmsCategories.deletedAt),
        lte(cmsCategories.deletedAt, cutoff)
      )
    )
    .limit(BATCH_SIZE);

  if (trashedCategories.length > 0) {
    const catIds = trashedCategories.map((c) => c.id);
    await db.delete(cmsCategories).where(inArray(cmsCategories.id, catIds));
    log.info(
      `Permanently deleted ${trashedCategories.length} trashed categories`
    );
  }
}

const PUSH_RETENTION_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

async function cleanupStalePushSubscriptions(): Promise<void> {
  const cutoff = new Date(Date.now() - PUSH_RETENTION_MS);
  const result = await db
    .delete(saasPushSubscriptions)
    .where(lte(saasPushSubscriptions.updatedAt, cutoff))
    .returning({ id: saasPushSubscriptions.id });
  if (result.length > 0)
    log.info(
      `Cleaned up ${result.length} stale push subscriptions (>180 days)`
    );
}

/**
 * Lift temporary bans whose `banExpires` has passed. Better Auth's admin
 * plugin only clears an expired ban lazily, at the user's NEXT sign-in — so
 * everything that reads `user.banned` directly (admin lists, exports, the
 * session shape via customSession) keeps reporting the user as banned until
 * then. The sweep makes the stored state true on its own schedule.
 */
async function expireLapsedBans(): Promise<void> {
  const result = await db
    .update(user)
    .set({
      banned: false,
      banReason: null,
      banExpires: null,
      updatedAt: new Date(),
    })
    .where(and(isNotNull(user.banExpires), lte(user.banExpires, new Date())))
    .returning({ id: user.id });
  if (result.length > 0)
    log.info(`Lifted ${result.length} expired temporary ban(s)`);
}

/**
 * `saas_subscription_events` is the webhook idempotency log: every Stripe /
 * NOWPayments delivery inserts a row with the full event JSON and nothing ever
 * pruned it. The rows only matter while the provider may still redeliver
 * (Stripe retries for 3 days, NOWPayments for hours), so 90 days is a wide
 * margin. Postgres has no `DELETE … LIMIT`, hence the id-subquery batches;
 * the iteration cap bounds one run on a huge backlog — the rest goes next
 * night.
 */
const WEBHOOK_EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const WEBHOOK_EVENT_PRUNE_BATCH = 5000;
const WEBHOOK_EVENT_PRUNE_MAX_BATCHES = 20;

async function cleanupProcessedWebhookEvents(): Promise<void> {
  const cutoff = new Date(Date.now() - WEBHOOK_EVENT_RETENTION_MS);

  let totalDeleted = 0;
  for (let i = 0; i < WEBHOOK_EVENT_PRUNE_MAX_BATCHES; i++) {
    const batch = await db
      .delete(saasSubscriptionEvents)
      .where(
        inArray(
          saasSubscriptionEvents.id,
          db
            .select({ id: saasSubscriptionEvents.id })
            .from(saasSubscriptionEvents)
            .where(lt(saasSubscriptionEvents.createdAt, cutoff))
            .limit(WEBHOOK_EVENT_PRUNE_BATCH)
        )
      )
      .returning({ id: saasSubscriptionEvents.id });
    totalDeleted += batch.length;
    if (batch.length < WEBHOOK_EVENT_PRUNE_BATCH) break;
  }

  if (totalDeleted > 0)
    log.info(`Cleaned up ${totalDeleted} processed webhook events (>90 days)`);
}

// ---------------------------------------------------------------------------
// Register all maintenance tasks
// ---------------------------------------------------------------------------

registerMaintenanceTask('expireLapsedBans', expireLapsedBans);
registerMaintenanceTask('cleanupOrphanedMedia', cleanupOrphanedMedia);
registerMaintenanceTask('cleanupExpiredSessions', cleanupExpiredSessions);
registerMaintenanceTask('cleanupOldAuditLogs', cleanupOldAuditLogs);
registerMaintenanceTask(
  'cleanupExpiredNotifications',
  cleanupExpiredNotifications
);
registerMaintenanceTask('cleanupDeadTasks', cleanupDeadTasks);
registerMaintenanceTask('permanentDeleteTrash', permanentDeleteTrash);
registerMaintenanceTask(
  'cleanupStalePushSubscriptions',
  cleanupStalePushSubscriptions
);
registerMaintenanceTask(
  'cleanupProcessedWebhookEvents',
  cleanupProcessedWebhookEvents
);
