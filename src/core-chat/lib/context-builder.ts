import { desc, eq, and } from 'drizzle-orm';
import { db } from '@/server/db';
import { chatMessages } from '@/core-chat/schema/messages';
import { chatConversationSummaries } from '@/core-chat/schema/messages';
import { chatCharacters, type ChatCharacter } from '@/core-chat/schema/characters';
import { composeSystemPrompt } from './system-prompt';
import { MessageRole } from './types';
import type { LlmMessage } from './adapters/types';

/**
 * Build the LLM message context for a conversation.
 *
 * 1. Compose enriched system prompt (character traits + date/time + user context)
 * 2. Append conversation summaries
 * 3. Append N most recent messages
 */
export async function buildContext(
  conversationId: string,
  character: ChatCharacter,
  contextMessageLimit: number,
  opts?: { userName?: string | null; userTimezone?: string | null; lang?: string | null },
): Promise<LlmMessage[]> {
  const context: LlmMessage[] = [];

  // 1. Enriched system prompt with character traits
  const systemPrompt = composeSystemPrompt({
    characterName: character.name,
    systemPrompt: character.systemPrompt,
    genderId: character.genderId,
    sexualityId: character.sexualityId,
    ethnicityId: character.ethnicityId,
    personalityId: character.personalityId,
    kinkId: character.kinkId,
    jobId: character.jobId,
    hobbies: character.hobbies as number[] | null,
    relationshipId: character.relationshipId,
    userName: opts?.userName,
    userTimezone: opts?.userTimezone,
    lang: opts?.lang,
  });
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
    context.push({ role: 'system', content: `Previous conversation summary:\n${summaryText}` });
  }

  // 3. Load recent messages (newest first, then reverse)
  const recentMessages = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(and(
      eq(chatMessages.conversationId, conversationId),
      eq(chatMessages.status, 'delivered'),
    ))
    .orderBy(desc(chatMessages.createdAt))
    .limit(contextMessageLimit);

  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i]!;
    if (msg.role === MessageRole.USER || msg.role === MessageRole.ASSISTANT) {
      context.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }
  }

  return context;
}
