import { eq, and, lt, isNull } from 'drizzle-orm';
import { createQueue, createWorker } from '@/core/lib/queue';
import { createLogger } from '@/core/lib/logger';
import { db } from '@/server/db';
import { chatConversations } from '@/core-chat/schema/conversations';
import { ConversationStatus } from '@/core-chat/lib/types';

const logger = createLogger('chat-cleanup');
const _queue = createQueue('chat-cleanup');

export function startChatCleanupWorker(): void {
  createWorker('chat-cleanup', async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Hard-delete conversations marked as 'deleted' older than 30 days
    // CASCADE will delete messages + summaries
    const deleted = await db
      .delete(chatConversations)
      .where(and(
        eq(chatConversations.status, ConversationStatus.DELETED),
        lt(chatConversations.updatedAt, thirtyDaysAgo),
      ))
      .returning({ id: chatConversations.id });

    if (deleted.length > 0) {
      logger.info('Hard-deleted stale conversations', { count: deleted.length });
    }

    // Auto-archive active conversations with no messages in 30 days
    const staleArchived = await db
      .update(chatConversations)
      .set({ status: ConversationStatus.ARCHIVED, updatedAt: new Date() })
      .where(and(
        eq(chatConversations.status, ConversationStatus.ACTIVE),
        lt(chatConversations.lastMessageAt, thirtyDaysAgo),
      ))
      .returning({ id: chatConversations.id });

    if (staleArchived.length > 0) {
      logger.info('Auto-archived stale conversations', { count: staleArchived.length });
    }
  });

  // Schedule repeating: every hour
  _queue?.add('cleanup', {}, {
    repeat: { every: 60 * 60 * 1000 },
    jobId: 'chat-cleanup-recurring',
  }).catch(() => {
    // Queue not available
  });
}
