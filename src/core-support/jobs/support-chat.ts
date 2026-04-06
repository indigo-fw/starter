import { and, eq, lt } from 'drizzle-orm';

import { createQueue, createWorker } from '@/core/lib/queue';
import { db } from '@/server/db';
import { saasSupportChatSessions } from '@/core-support/schema/support-chat';
import { createLogger } from '@/core/lib/logger';

const logger = createLogger('support-chat-cleanup');
const _supportChatQueue = createQueue('support-chat-cleanup');

/** Close stale chat sessions older than 24 hours */
export async function cleanupStaleSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const stale = await db
    .select({ id: saasSupportChatSessions.id })
    .from(saasSupportChatSessions)
    .where(
      and(
        eq(saasSupportChatSessions.status, 'ai_active'),
        lt(saasSupportChatSessions.createdAt, cutoff),
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

/** Start the support chat cleanup worker (called from server.ts) */
export function startSupportChatCleanupWorker(): void {
  createWorker('support-chat-cleanup', async () => {
    await cleanupStaleSessions();
  });
}
