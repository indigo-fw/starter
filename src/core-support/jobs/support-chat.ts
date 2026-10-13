import { and, eq, lt } from 'drizzle-orm';

import { saasSupportChatSessions } from '@/core-support/schema/support-chat';
import { createLogger } from '@/core/lib/infra/logger';
import { createQueue, createWorker } from '@/core/lib/infra/queue';
import { db } from '@/server/db';

/**
 * Repeatable-job definition. Single source of truth: the worker arms it at
 * start and `src/scripts/schedule-jobs.ts` re-arms it by hand — neither
 * duplicates the id/interval.
 */
export const SUPPORT_CHAT_CLEANUP_SCHEDULE = {
  queue: 'support-chat-cleanup',
  schedulerId: 'support-chat-cleanup',
  everyMs: 60 * 60 * 1000,
} as const;

const logger = createLogger('support-chat-cleanup');
const _supportChatQueue = createQueue(SUPPORT_CHAT_CLEANUP_SCHEDULE.queue);

/** Close stale chat sessions older than 24 hours */
export async function cleanupStaleSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const stale = await db
    .select({ id: saasSupportChatSessions.id })
    .from(saasSupportChatSessions)
    .where(
      and(
        eq(saasSupportChatSessions.status, 'ai_active'),
        lt(saasSupportChatSessions.createdAt, cutoff)
      )
    )
    .limit(100);

  if (stale.length === 0) return;

  const now = new Date();
  for (const session of stale) {
    await db
      .update(saasSupportChatSessions)
      .set({ status: 'closed', closedAt: now })
      .where(eq(saasSupportChatSessions.id, session.id));
  }

  logger.info(`Closed ${stale.length} stale chat sessions`);
}

/**
 * Idempotently register the repeatable job. Resolves false when Redis is
 * absent (no queue), so callers can report "skipped" rather than "armed".
 */
export async function ensureSupportChatCleanupSchedule(): Promise<boolean> {
  if (!_supportChatQueue) return false;
  await _supportChatQueue.upsertJobScheduler(
    SUPPORT_CHAT_CLEANUP_SCHEDULE.schedulerId,
    {
      every: SUPPORT_CHAT_CLEANUP_SCHEDULE.everyMs,
    }
  );
  return true;
}

/** Start the support chat cleanup worker (called from server.ts) */
export function startSupportChatCleanupWorker(): void {
  // Self-register so a fresh deploy cleans up without a manual scheduling
  // step. Non-fatal: the worker still consumes jobs armed earlier.
  ensureSupportChatCleanupSchedule().catch((err: unknown) => {
    logger.warn('Failed to register support-chat-cleanup schedule', {
      error: String(err),
    });
  });

  createWorker(SUPPORT_CHAT_CLEANUP_SCHEDULE.queue, async () => {
    await cleanupStaleSessions();
  });
}
