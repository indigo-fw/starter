import { and, lt, lte, isNotNull, inArray } from 'drizzle-orm';

import { getStorage } from '@/core/storage';
import { createLogger } from '@/core/lib/infra/logger';
import { registerMaintenanceTask } from '@/core/lib/infra/maintenance';
import { db } from '@/server/db';
import { cmsMedia } from '@/server/db/schema/media';
import { cmsPosts, cmsPostAttachments } from '@/server/db/schema/cms';
import { cmsCategories } from '@/server/db/schema/categories';
import { session } from '@/server/db/schema/auth';
import { cmsAuditLog } from '@/server/db/schema/audit';
import { saasNotifications } from '@/server/db/schema/notifications';
import { saasPushSubscriptions } from '@/server/db/schema/push-subscriptions';
import { saasTaskQueue } from '@/server/db/schema/task-queue';

const log = createLogger('maintenance');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;

async function cleanupOrphanedMedia(): Promise<void> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
  const staleMedia = await db
    .select({ id: cmsMedia.id, filepath: cmsMedia.filepath, thumbnailPath: cmsMedia.thumbnailPath, mediumPath: cmsMedia.mediumPath })
    .from(cmsMedia)
    .where(and(isNotNull(cmsMedia.deletedAt), lte(cmsMedia.deletedAt, cutoff)))
    .limit(BATCH_SIZE);

  if (staleMedia.length === 0) return;
  const storage = getStorage();

  for (const media of staleMedia) {
    const paths = [media.filepath, media.thumbnailPath, media.mediumPath].filter(Boolean) as string[];
    for (const p of paths) {
      try { await storage.delete(p); } catch { /* File may already be gone */ }
    }
  }

  const ids = staleMedia.map((m) => m.id);
  await db.delete(cmsMedia).where(inArray(cmsMedia.id, ids));
  log.info(`Cleaned up ${staleMedia.length} orphaned media files`);
}

async function cleanupExpiredSessions(): Promise<void> {
  const result = await db.delete(session).where(lt(session.expiresAt, new Date())).returning({ id: session.id });
  if (result.length > 0) log.info(`Cleaned up ${result.length} expired sessions`);
}

async function cleanupOldAuditLogs(): Promise<void> {
  const { infraConfig } = await import('@/config/infra');
  const envOverride = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS ?? '0', 10);
  const retentionDays = envOverride > 0 ? envOverride : infraConfig.audit.retentionDays;
  if (!retentionDays || retentionDays <= 0) return;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  let totalDeleted = 0;
  let batch: { id: string }[];
  do {
    batch = await db.delete(cmsAuditLog).where(lt(cmsAuditLog.createdAt, cutoff)).returning({ id: cmsAuditLog.id });
    totalDeleted += batch.length;
  } while (batch.length >= 1000);

  if (totalDeleted > 0) log.info(`Cleaned up ${totalDeleted} old audit logs (retention: ${retentionDays}d)`);
}

async function cleanupExpiredNotifications(): Promise<void> {
  const result = await db.delete(saasNotifications)
    .where(and(isNotNull(saasNotifications.expiresAt), lt(saasNotifications.expiresAt, new Date())))
    .returning({ id: saasNotifications.id });
  if (result.length > 0) log.info(`Cleaned up ${result.length} expired notifications`);
}

async function cleanupDeadTasks(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await db.delete(saasTaskQueue)
    .where(and(inArray(saasTaskQueue.status, ['completed', 'dead']), lt(saasTaskQueue.updatedAt, cutoff)))
    .returning({ id: saasTaskQueue.id });
  if (result.length > 0) log.info(`Cleaned up ${result.length} dead/completed queue tasks`);
}

async function permanentDeleteTrash(): Promise<void> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);

  const trashedPosts = await db.select({ id: cmsPosts.id }).from(cmsPosts)
    .where(and(isNotNull(cmsPosts.deletedAt), lte(cmsPosts.deletedAt, cutoff))).limit(BATCH_SIZE);

  if (trashedPosts.length > 0) {
    const postIds = trashedPosts.map((p) => p.id);
    await db.delete(cmsPostAttachments).where(inArray(cmsPostAttachments.postId, postIds));
    await db.delete(cmsPosts).where(inArray(cmsPosts.id, postIds));
    log.info(`Permanently deleted ${trashedPosts.length} trashed posts`);
  }

  const trashedCategories = await db.select({ id: cmsCategories.id }).from(cmsCategories)
    .where(and(isNotNull(cmsCategories.deletedAt), lte(cmsCategories.deletedAt, cutoff))).limit(BATCH_SIZE);

  if (trashedCategories.length > 0) {
    const catIds = trashedCategories.map((c) => c.id);
    await db.delete(cmsCategories).where(inArray(cmsCategories.id, catIds));
    log.info(`Permanently deleted ${trashedCategories.length} trashed categories`);
  }
}

const PUSH_RETENTION_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

async function cleanupStalePushSubscriptions(): Promise<void> {
  const cutoff = new Date(Date.now() - PUSH_RETENTION_MS);
  const result = await db.delete(saasPushSubscriptions).where(lte(saasPushSubscriptions.updatedAt, cutoff)).returning({ id: saasPushSubscriptions.id });
  if (result.length > 0) log.info(`Cleaned up ${result.length} stale push subscriptions (>180 days)`);
}

// ---------------------------------------------------------------------------
// Register all maintenance tasks
// ---------------------------------------------------------------------------

registerMaintenanceTask('cleanupOrphanedMedia', cleanupOrphanedMedia);
registerMaintenanceTask('cleanupExpiredSessions', cleanupExpiredSessions);
registerMaintenanceTask('cleanupOldAuditLogs', cleanupOldAuditLogs);
registerMaintenanceTask('cleanupExpiredNotifications', cleanupExpiredNotifications);
registerMaintenanceTask('cleanupDeadTasks', cleanupDeadTasks);
registerMaintenanceTask('permanentDeleteTrash', permanentDeleteTrash);
registerMaintenanceTask('cleanupStalePushSubscriptions', cleanupStalePushSubscriptions);
