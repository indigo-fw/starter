import { eq, sql } from 'drizzle-orm';
import { createLogger } from '@/core/lib/logger';
import { createQueue, createWorker } from '@/core/lib/queue';
import { db } from '@/server/db';
import { chatMessages } from '@/core-chat/schema/messages';
import { chatConversations } from '@/core-chat/schema/conversations';
import { chatCharacters } from '@/core-chat/schema/characters';
import { getChatDeps } from '@/core-chat/deps';
import { getChatConfig } from '@/core-chat/config';
import { getProviderFromEnv } from './ai-provider';
import { buildContext } from './context-builder';
import { enqueueSummarize } from '@/core-chat/jobs/summarize';
import { ChatWsEvent, MessageRole, MessageStatus } from './types';

const logger = createLogger('chat-engine');

// ─── BullMQ queue for AI response jobs ──────────────────────────────────────

export interface ChatAiJob {
  conversationId: string;
  userId: string;
  organizationId: string;
}

const chatAiQueue = createQueue('chat-ai-response');

/**
 * Enqueue an AI response job. If Redis is unavailable, falls back to
 * in-process execution (fire-and-forget).
 */
export function enqueueAiResponse(job: ChatAiJob): void {
  if (chatAiQueue) {
    chatAiQueue.add('ai-response', job, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    }).catch((err) => {
      logger.error('Failed to enqueue AI response job, falling back to in-process', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Fallback: run in-process
      processAiResponse(job).catch(() => {});
    });
  } else {
    // No Redis — run in-process (dev mode)
    processAiResponse(job).catch((err) => {
      logger.error('In-process AI response failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

/**
 * Start the BullMQ worker that processes AI response jobs.
 * Called from module.config.ts jobs array.
 */
export function startChatAiWorker(): void {
  createWorker('chat-ai-response', async (job) => {
    const data = job.data as ChatAiJob;
    await processAiResponse(data);
  }, 3); // concurrency: 3
}

// ─── Core processing logic ──────────────────────────────────────────────────

/**
 * Process an AI response for a conversation.
 *
 * 1. Load character + build context
 * 2. Stream AI response via WebSocket
 * 3. Insert assistant message
 * 4. Deduct tokens
 * 5. Update conversation stats
 * 6. Trigger summarization if needed
 */
async function processAiResponse(job: ChatAiJob): Promise<void> {
  const { conversationId, userId, organizationId } = job;
  const deps = getChatDeps();
  const config = getChatConfig();
  const tempId = crypto.randomUUID();

  try {
    // 1. Load conversation + character
    const [conv] = await db
      .select({
        characterId: chatConversations.characterId,
        messageCount: chatConversations.messageCount,
      })
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);

    if (!conv) {
      logger.error('Conversation not found for AI response', { conversationId });
      return;
    }

    const [character] = await db
      .select({
        systemPrompt: chatCharacters.systemPrompt,
        model: chatCharacters.model,
        tokenCostMultiplier: chatCharacters.tokenCostMultiplier,
      })
      .from(chatCharacters)
      .where(eq(chatCharacters.id, conv.characterId))
      .limit(1);

    if (!character) {
      logger.error('Character not found for AI response', { characterId: conv.characterId });
      broadcastFailed(deps, conversationId, tempId);
      return;
    }

    // 2. Get AI provider
    const provider = await getProviderFromEnv(character.model ?? undefined);
    if (!provider) {
      logger.error('No AI provider configured');
      broadcastFailed(deps, conversationId, tempId);
      return;
    }

    // 3. Build context
    const context = await buildContext(
      conversationId,
      character.systemPrompt,
      config.contextMessageLimit,
    );

    // 4. Broadcast stream start
    deps.broadcastEvent(`chat:${conversationId}`, ChatWsEvent.MSG_STREAM_START, {
      type: ChatWsEvent.MSG_STREAM_START,
      conversationId,
      tempId,
    });

    // 5. Stream response
    let fullText = '';
    let tokenCount = 0;
    let chunkIndex = 0;

    for await (const chunk of provider.stream(context)) {
      if (chunk.done) {
        tokenCount = chunk.tokenCount ?? 0;
        break;
      }
      fullText += chunk.chunk;
      deps.broadcastEvent(`chat:${conversationId}`, ChatWsEvent.MSG_STREAM_CHUNK, {
        type: ChatWsEvent.MSG_STREAM_CHUNK,
        conversationId,
        tempId,
        chunk: chunk.chunk,
        index: chunkIndex++,
      });
    }

    if (!fullText.trim()) {
      logger.error('AI returned empty response', { conversationId });
      broadcastFailed(deps, conversationId, tempId);
      return;
    }

    // 6. Insert assistant message
    const messageId = crypto.randomUUID();
    await db.insert(chatMessages).values({
      id: messageId,
      conversationId,
      role: MessageRole.ASSISTANT,
      content: fullText,
      status: MessageStatus.DELIVERED,
      tokenCount,
    });

    // 7. Broadcast stream end
    deps.broadcastEvent(`chat:${conversationId}`, ChatWsEvent.MSG_STREAM_END, {
      type: ChatWsEvent.MSG_STREAM_END,
      conversationId,
      tempId,
      messageId,
      content: fullText,
      tokenCount,
    });

    // 8. Deduct tokens (log but don't fail the response)
    const cost = Math.ceil(config.tokenCostPerMessage * character.tokenCostMultiplier);
    if (cost > 0) {
      try {
        await deps.deductTokens(organizationId, cost, 'ai_chat', {
          conversationId,
          messageId,
          tokenCount,
        });
      } catch (err) {
        logger.error('Token deduction failed (post-response)', {
          error: err instanceof Error ? err.message : String(err),
          organizationId,
          cost,
        });
      }
    }

    // 9. Update conversation stats
    const newMessageCount = conv.messageCount + 2;
    await db
      .update(chatConversations)
      .set({
        lastMessageAt: new Date(),
        messageCount: newMessageCount,
        totalTokensUsed: sql`${chatConversations.totalTokensUsed} + ${tokenCount}`,
        updatedAt: new Date(),
      })
      .where(eq(chatConversations.id, conversationId));

    // 10. Trigger summarization if threshold exceeded
    if (newMessageCount >= config.summaryThreshold && newMessageCount % config.summaryThreshold < 2) {
      enqueueSummarize(conversationId);
    }

  } catch (err) {
    logger.error('processAiResponse failed', {
      error: err instanceof Error ? err.message : String(err),
      conversationId,
    });
    try {
      broadcastFailed(getChatDeps(), conversationId, tempId);
    } catch {
      // deps not ready
    }
  }
}

function broadcastFailed(deps: ReturnType<typeof getChatDeps>, conversationId: string, tempId: string): void {
  deps.broadcastEvent(`chat:${conversationId}`, ChatWsEvent.MSG_STATUS, {
    type: ChatWsEvent.MSG_STATUS,
    conversationId,
    tempId,
    status: MessageStatus.FAILED,
  });
}
