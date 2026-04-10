import { eq, and, lt, isNull, isNotNull, notInArray, sql } from 'drizzle-orm';
import { createQueue, createWorker } from '@/core/lib/infra/queue';
import { createLogger } from '@/core/lib/infra/logger';
import { db } from '@/server/db';
import { chatConversations } from '@/core-chat/schema/conversations';
import { chatMedia } from '@/core-chat/schema/media';
import { chatMessages } from '@/core-chat/schema/messages';
import { chatCharacters } from '@/core-chat/schema/characters';
import { chatVoiceCalls } from '@/core-chat/schema/voice-calls';
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

    // Purge orphaned media (soft-deleted > 7 days, no message references)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const orphanedMedia = await db
      .delete(chatMedia)
      .where(and(
        isNotNull(chatMedia.deletedAt),
        lt(chatMedia.deletedAt, sevenDaysAgo),
      ))
      .returning({ id: chatMedia.id });

    if (orphanedMedia.length > 0) {
      logger.info('Purged soft-deleted media', { count: orphanedMedia.length });
    }

    // Recover orphaned voice calls (started but never finalized — crash recovery)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const orphanedCalls = await db
      .update(chatVoiceCalls)
      .set({ endedAt: new Date(), charged: true })
      .where(and(
        eq(chatVoiceCalls.charged, false),
        lt(chatVoiceCalls.startedAt, oneHourAgo),
      ))
      .returning({ id: chatVoiceCalls.id });

    if (orphanedCalls.length > 0) {
      logger.info('Recovered orphaned voice calls', { count: orphanedCalls.length });
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
