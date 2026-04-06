import { desc, eq, and } from 'drizzle-orm';
import { db } from '@/server/db';
import { chatMessages } from '@/core-chat/schema/messages';
import { chatConversationSummaries } from '@/core-chat/schema/messages';
import { MessageRole, type ChatAiMessage } from './types';

/**
 * Build the LLM message context for a conversation.
 *
 * Strategy:
 * 1. Start with character's system prompt
 * 2. Append any conversation summaries (compressed older history)
 * 3. Append the N most recent messages
 *
 * This keeps the context window manageable while preserving continuity.
 */
export async function buildContext(
  conversationId: string,
  systemPrompt: string,
  contextMessageLimit: number,
): Promise<ChatAiMessage[]> {
  const context: ChatAiMessage[] = [];

  // 1. System prompt
  context.push({ role: 'system', content: systemPrompt });

  // 2. Load summaries (oldest first)
  const summaries = await db
    .select({ summary: chatConversationSummaries.summary })
    .from(chatConversationSummaries)
    .where(eq(chatConversationSummaries.conversationId, conversationId))
    .orderBy(chatConversationSummaries.createdAt)
    .limit(5);

  if (summaries.length > 0) {
    const summaryText = summaries.map((s) => s.summary).join('\n\n');
    context.push({
      role: 'system',
      content: `Previous conversation summary:\n${summaryText}`,
    });
  }

  // 3. Load recent messages (newest first, then reverse for chronological order)
  const recentMessages = await db
    .select({
      role: chatMessages.role,
      content: chatMessages.content,
    })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.conversationId, conversationId),
        // Only include delivered user/assistant messages in context
        eq(chatMessages.status, 'delivered'),
      ),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(contextMessageLimit);

  // Reverse to chronological order
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i]!;
    if (msg.role === MessageRole.USER || msg.role === MessageRole.ASSISTANT) {
      context.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }
  }

  return context;
}
