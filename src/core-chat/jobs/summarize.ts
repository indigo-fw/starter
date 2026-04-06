import { eq, desc, and, gt } from 'drizzle-orm';
import { createQueue, createWorker } from '@/core/lib/queue';
import { createLogger } from '@/core/lib/logger';
import { db } from '@/server/db';
import { chatMessages, chatConversationSummaries } from '@/core-chat/schema/messages';
import { chatConversations } from '@/core-chat/schema/conversations';
import { getProviderFromEnv } from '@/core-chat/lib/ai-provider';
import { MessageRole } from '@/core-chat/lib/types';

const logger = createLogger('chat-summarize');
const _queue = createQueue('chat-summarize');

export function startChatSummarizeWorker(): void {
  createWorker('chat-summarize', async (job) => {
    const { conversationId } = job.data as { conversationId: string };

    try {
      // Find the last summary's end timestamp (or conversation creation)
      const [lastSummary] = await db
        .select({ messagesTo: chatConversationSummaries.messagesTo })
        .from(chatConversationSummaries)
        .where(eq(chatConversationSummaries.conversationId, conversationId))
        .orderBy(desc(chatConversationSummaries.createdAt))
        .limit(1);

      const sinceDate = lastSummary?.messagesTo ?? new Date(0);

      // Fetch messages since last summary
      const messages = await db
        .select({
          role: chatMessages.role,
          content: chatMessages.content,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .where(and(
          eq(chatMessages.conversationId, conversationId),
          eq(chatMessages.status, 'delivered'),
          gt(chatMessages.createdAt, sinceDate),
        ))
        .orderBy(chatMessages.createdAt)
        .limit(200);

      if (messages.length < 20) {
        logger.info('Not enough messages to summarize', { conversationId, count: messages.length });
        return;
      }

      const provider = await getProviderFromEnv();
      if (!provider) {
        logger.warn('No AI provider configured for summarization');
        return;
      }

      // Build transcript
      const transcript = messages
        .map((m) => `${m.role === MessageRole.USER ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

      const result = await provider.complete([
        {
          role: 'system',
          content: 'Summarize the following conversation in 2-3 concise paragraphs. Focus on key topics, decisions, and emotional tone. This summary will be used as context for future messages.',
        },
        { role: 'user', content: transcript },
      ], { maxTokens: 500, temperature: 0.3 });

      if (!result?.text) {
        logger.error('Summarization returned empty result', { conversationId });
        return;
      }

      await db.insert(chatConversationSummaries).values({
        conversationId,
        summary: result.text,
        messagesFrom: messages[0]!.createdAt!,
        messagesTo: messages[messages.length - 1]!.createdAt!,
        messagesCovered: messages.length,
      });

      logger.info('Conversation summarized', { conversationId, messagesCovered: messages.length });
    } catch (err) {
      logger.error('Summarization failed', {
        error: err instanceof Error ? err.message : String(err),
        conversationId,
      });
    }
  }, 2);
}

/** Enqueue a summarization job */
export function enqueueSummarize(conversationId: string): void {
  _queue?.add('summarize', { conversationId }, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
    // Deduplicate: only one summarize job per conversation
    jobId: `summarize-${conversationId}`,
  }).catch(() => {
    // Queue not available — skip
  });
}
