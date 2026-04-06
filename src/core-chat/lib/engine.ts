import { eq, sql } from 'drizzle-orm';
import { createLogger } from '@/core/lib/logger';
import { createQueue, createWorker } from '@/core/lib/queue';
import { db } from '@/server/db';
import { chatMessages } from '@/core-chat/schema/messages';
import { chatConversations } from '@/core-chat/schema/conversations';
import { chatCharacters } from '@/core-chat/schema/characters';
import { getChatDeps } from '@/core-chat/deps';
import { getChatConfig } from '@/core-chat/config';
import { streamAiResponse } from './ai-provider';
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
 * Enqueue an AI response job. Falls back to in-process if no Redis.
 */
export function enqueueAiResponse(job: ChatAiJob): void {
  if (chatAiQueue) {
    chatAiQueue.add('ai-response', job, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    }).catch((err) => {
      logger.error('Failed to enqueue AI job, falling back to in-process', {
        error: err instanceof Error ? err.message : String(err),
      });
      processAiResponse(job).catch(() => {});
    });
  } else {
    processAiResponse(job).catch((err) => {
      logger.error('In-process AI response failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

/** Start the BullMQ worker for AI response jobs */
export function startChatAiWorker(): void {
  createWorker('chat-ai-response', async (job) => {
    await processAiResponse(job.data as ChatAiJob);
  }, 3);
}

// ─── Core processing logic ──────────────────────────────────────────────────

async function processAiResponse(job: ChatAiJob): Promise<void> {
  const { conversationId, userId, organizationId } = job;
  const deps = getChatDeps();
  const config = getChatConfig();
  const tempId = crypto.randomUUID();
  let tokensPrepaid = 0;

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
      logger.error('Conversation not found', { conversationId });
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
      logger.error('Character not found', { characterId: conv.characterId });
      broadcastFailed(deps, conversationId, tempId);
      return;
    }

    // 2. Pre-pay tokens (deduct BEFORE generation)
    const cost = Math.ceil(config.tokenCostPerMessage * character.tokenCostMultiplier);
    if (cost > 0) {
      try {
        await deps.deductTokens(organizationId, cost, 'ai_chat', { conversationId });
        tokensPrepaid = cost;
      } catch (err) {
        logger.warn('Token deduction failed (insufficient balance)', {
          error: err instanceof Error ? err.message : String(err),
          organizationId,
          cost,
        });
        broadcastFailed(deps, conversationId, tempId);
        return;
      }
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
    let chunkIndex = 0;

    for await (const chunk of streamAiResponse(context, {
      model: character.model ?? undefined,
    })) {
      fullText += chunk;
      deps.broadcastEvent(`chat:${conversationId}`, ChatWsEvent.MSG_STREAM_CHUNK, {
        type: ChatWsEvent.MSG_STREAM_CHUNK,
        conversationId,
        tempId,
        chunk,
        index: chunkIndex++,
      });
    }

    if (!fullText.trim()) {
      logger.error('AI returned empty response', { conversationId });
      await refundTokens(deps, organizationId, tokensPrepaid, conversationId, 'empty_response');
      tokensPrepaid = 0;
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
    });

    // 7. Broadcast stream end
    deps.broadcastEvent(`chat:${conversationId}`, ChatWsEvent.MSG_STREAM_END, {
      type: ChatWsEvent.MSG_STREAM_END,
      conversationId,
      tempId,
      messageId,
      content: fullText,
    });

    // 8. Tokens already deducted (pre-paid). Mark as consumed.
    tokensPrepaid = 0; // Prevent refund in catch block

    // 9. Update conversation stats
    const newMessageCount = conv.messageCount + 2;
    await db
      .update(chatConversations)
      .set({
        lastMessageAt: new Date(),
        messageCount: newMessageCount,
        totalTokensUsed: sql`${chatConversations.totalTokensUsed} + ${cost}`,
        updatedAt: new Date(),
      })
      .where(eq(chatConversations.id, conversationId));

    // 10. Trigger summarization if needed
    if (newMessageCount >= config.summaryThreshold && newMessageCount % config.summaryThreshold < 2) {
      enqueueSummarize(conversationId);
    }

  } catch (err) {
    logger.error('processAiResponse failed', {
      error: err instanceof Error ? err.message : String(err),
      conversationId,
    });

    // Refund pre-paid tokens on failure
    if (tokensPrepaid > 0) {
      await refundTokens(deps, organizationId, tokensPrepaid, conversationId, 'ai_failure');
    }

    try {
      broadcastFailed(getChatDeps(), conversationId, tempId);
    } catch {
      // deps not ready
    }
  }
}

async function refundTokens(
  deps: ReturnType<typeof getChatDeps>,
  orgId: string,
  amount: number,
  conversationId: string,
  reason: string,
): Promise<void> {
  try {
    await deps.addTokens(orgId, amount, 'ai_chat_refund', { conversationId, reason });
    logger.info('Tokens refunded after AI failure', { orgId, amount, reason });
  } catch (err) {
    logger.error('Token refund failed', {
      error: err instanceof Error ? err.message : String(err),
      orgId,
      amount,
    });
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
