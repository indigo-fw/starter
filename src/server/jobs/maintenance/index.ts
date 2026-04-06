import { and, lt, lte, isNotNull, inArray } from 'drizzle-orm';

import { createQueue, createWorker } from '@/core/lib/queue';
import { getStorage } from '@/core/storage';
import { createLogger } from '@/core/lib/logger';
import { db } from '@/server/db';
import { cmsMedia } from '@/server/db/schema/media';
import { cmsPosts, cmsPostAttachments } from '@/server/db/schema/cms';
import { cmsCategories } from '@/server/db/schema/categories';
import { session } from '@/server/db/schema/auth';
import { cmsAuditLog } from '@/server/db/schema/audit';
import { saasNotifications } from '@/server/db/schema/notifications';
import { saasTaskQueue } from '@/server/db/schema/task-queue';

const log = createLogger('maintenance');

const _maintenanceQueue = createQueue('maintenance');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;

/**
 * Permanently delete soft-deleted media older than 30 days.
 * Also removes the physical files from storage.
 */
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
    .where(
      and(isNotNull(cmsMedia.deletedAt), lte(cmsMedia.deletedAt, cutoff))
    )
    .limit(BATCH_SIZE);

  if (staleMedia.length === 0) return;

  const storage = getStorage();

  for (const media of staleMedia) {
    // Delete physical files (best-effort)
    const paths = [media.filepath, media.thumbnailPath, media.mediumPath].filter(
      Boolean
    ) as string[];

    for (const p of paths) {
      try {
        await storage.delete(p);
      } catch {
        // File may already be gone
      }
    }
  }

  // Hard-delete the DB records
  const ids = staleMedia.map((m) => m.id);
  await db.delete(cmsMedia).where(inArray(cmsMedia.id, ids));

  log.info(`Cleaned up ${staleMedia.length} orphaned media files`);
}

/**
 * Delete expired auth sessions.
 */
async function cleanupExpiredSessions(): Promise<void> {
  const now = new Date();

  const result = await db
    .delete(session)
    .where(lt(session.expiresAt, now))
    .returning({ id: session.id });

  if (result.length > 0) {
    log.info(`Cleaned up ${result.length} expired sessions`);
  }
}

/**
 * Delete old audit logs beyond retention period.
 * Reads AUDIT_LOG_RETENTION_DAYS from env. Set to 0 to disable.
 * Disabled by default — audit logs may be required for compliance.
 */
async function cleanupOldAuditLogs(): Promise<void> {
  const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS ?? '0', 10);
  if (!retentionDays || retentionDays <= 0) return; // Disabled by default

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  // Batch delete to avoid lock contention
  let totalDeleted = 0;
  let batch: { id: string }[];

  do {
    batch = await db
      .delete(cmsAuditLog)
      .where(lt(cmsAuditLog.createdAt, cutoff))
      .returning({ id: cmsAuditLog.id });

    totalDeleted += batch.length;
  } while (batch.length >= 1000);

  if (totalDeleted > 0) {
    log.info(`Cleaned up ${totalDeleted} old audit logs (retention: ${retentionDays}d)`);
  }
}

/**
 * Delete notifications past their expiration date.
 */
async function cleanupExpiredNotifications(): Promise<void> {
  const now = new Date();

  const result = await db
    .delete(saasNotifications)
    .where(
      and(isNotNull(saasNotifications.expiresAt), lt(saasNotifications.expiresAt, now))
    )
    .returning({ id: saasNotifications.id });

  if (result.length > 0) {
    log.info(`Cleaned up ${result.length} expired notifications`);
  }
}

/**
 * Purge completed/dead DB queue tasks older than 7 days.
 */
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

  if (result.length > 0) {
    log.info(`Cleaned up ${result.length} dead/completed queue tasks`);
  }
}

/**
 * Permanently delete soft-deleted posts and categories older than 30 days.
 */
async function permanentDeleteTrash(): Promise<void> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);

  // Delete post attachments for trashed posts first
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

  // Delete trashed categories
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
    log.info(`Permanently deleted ${trashedCategories.length} trashed categories`);
  }
}

/**
 * Run all maintenance tasks. Each catches its own errors independently.
 */
export async function runMaintenance(): Promise<void> {
  log.info('Running maintenance tasks');

  const tasks: Array<{ name: string; fn: () => Promise<void> }> = [
    { name: 'cleanupOrphanedMedia', fn: cleanupOrphanedMedia },
    { name: 'cleanupExpiredSessions', fn: cleanupExpiredSessions },
    { name: 'cleanupOldAuditLogs', fn: cleanupOldAuditLogs },
    { name: 'cleanupExpiredNotifications', fn: cleanupExpiredNotifications },
    { name: 'cleanupDeadTasks', fn: cleanupDeadTasks },
    { name: 'permanentDeleteTrash', fn: permanentDeleteTrash },
  ];

  for (const task of tasks) {
    try {
      await task.fn();
    } catch (err) {
      log.error(`Maintenance task failed: ${task.name}`, { error: String(err) });
    }
  }

  log.info('Maintenance tasks complete');
}

export function startMaintenanceWorker(): void {
  createWorker('maintenance', async () => {
    await runMaintenance();
  });
  log.info('Maintenance worker started');
}
