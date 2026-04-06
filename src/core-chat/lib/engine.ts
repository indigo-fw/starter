import { eq, sql, desc, and } from 'drizzle-orm';
import { createLogger } from '@/core/lib/logger';
import { createQueue, createWorker } from '@/core/lib/queue';
import { db } from '@/server/db';
import { chatMessages } from '@/core-chat/schema/messages';
import { chatConversations } from '@/core-chat/schema/conversations';
import { chatCharacters } from '@/core-chat/schema/characters';
import { chatMedia } from '@/core-chat/schema/media';
import { getChatDeps } from '@/core-chat/deps';
import { getChatConfig } from '@/core-chat/config';
import { streamAiResponse, generateImage, generateVideo } from './ai-provider';
import { buildContext } from './context-builder';
import { detectMessageType } from './detect-message-type';
import { initImagePipeline } from './image/init';
import { orchestratePrompt } from './image/orchestrator';
import { buildImagePrompt } from './image/prompt-builder';
import { detectNsfw } from './image/nsfw-detector';
import { getPreset, getDefaultPreset } from './image/presets/registry';
import { enqueueSummarize } from '@/core-chat/jobs/summarize';
import { dispatchWebhook } from '@/core/lib/webhooks';
import { ChatWsEvent, MessageRole, MessageStatus } from './types';
import type { ChatCharacter } from '@/core-chat/schema/characters';

const logger = createLogger('chat-engine');

// ─── BullMQ job queue ───────────────────────────────────────────────────────

export interface ChatAiJob {
  conversationId: string;
  userId: string;
  organizationId: string;
  lastUserMessage: string;
}

const chatAiQueue = createQueue('chat-ai-response');

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

export function startChatAiWorker(): void {
  createWorker('chat-ai-response', async (job) => {
    await processAiResponse(job.data as ChatAiJob);
  }, 3);
}

// ─── Core processing logic ──────────────────────────────────────────────────

async function processAiResponse(job: ChatAiJob): Promise<void> {
  const { conversationId, userId, organizationId, lastUserMessage } = job;
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

    if (!conv) { logger.error('Conversation not found', { conversationId }); return; }

    const [character] = await db
      .select()
      .from(chatCharacters)
      .where(eq(chatCharacters.id, conv.characterId))
      .limit(1);

    if (!character) {
      logger.error('Character not found', { characterId: conv.characterId });
      broadcastFailed(deps, conversationId, tempId);
      return;
    }

    // 2. Pre-pay tokens
    const cost = Math.ceil(config.tokenCostPerMessage * character.tokenCostMultiplier);
    if (cost > 0) {
      try {
        await deps.deductTokens(organizationId, cost, 'ai_chat', { conversationId });
        tokensPrepaid = cost;
      } catch (err) {
        logger.warn('Token deduction failed', { error: err instanceof Error ? err.message : String(err) });
        broadcastFailed(deps, conversationId, tempId);
        return;
      }
    }

    // 3. Detect response type from the user's last message
    const responseType = detectMessageType(lastUserMessage);

    if (responseType === 'text') {
      await processTextResponse(conversationId, character, conv, deps, config, tempId, cost, organizationId);
    } else if (responseType === 'image') {
      await processImageResponse(conversationId, character, deps, tempId, lastUserMessage);
    } else if (responseType === 'video') {
      await processVideoResponse(conversationId, deps, tempId);
    }

    // Mark tokens as consumed
    tokensPrepaid = 0;

    // Update conversation stats
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

    // Trigger summarization if needed
    if (newMessageCount >= config.summaryThreshold && newMessageCount % config.summaryThreshold < 2) {
      enqueueSummarize(conversationId);
    }

    // Webhook
    dispatchWebhook(db, 'chat.message.sent', { conversationId, userId, responseType });

  } catch (err) {
    logger.error('processAiResponse failed', {
      error: err instanceof Error ? err.message : String(err),
      conversationId,
    });
    if (tokensPrepaid > 0) {
      await refundTokens(deps, organizationId, tokensPrepaid, conversationId, 'ai_failure');
    }
    try { broadcastFailed(getChatDeps(), conversationId, tempId); } catch { /* */ }
  }
}

// ─── Text response (LLM streaming) ─────────────────────────────────────────

async function processTextResponse(
  conversationId: string,
  character: ChatCharacter,
  conv: { messageCount: number },
  deps: ReturnType<typeof getChatDeps>,
  config: ReturnType<typeof getChatConfig>,
  tempId: string,
  cost: number,
  organizationId: string,
): Promise<void> {
  const context = await buildContext(conversationId, character, config.contextMessageLimit);

  deps.broadcastEvent(`chat:${conversationId}`, ChatWsEvent.MSG_STREAM_START, {
    type: ChatWsEvent.MSG_STREAM_START, conversationId, tempId,
  });

  let fullText = '';
  let chunkIndex = 0;

  for await (const chunk of streamAiResponse(context)) {
    fullText += chunk;
    deps.broadcastEvent(`chat:${conversationId}`, ChatWsEvent.MSG_STREAM_CHUNK, {
      type: ChatWsEvent.MSG_STREAM_CHUNK, conversationId, tempId, chunk, index: chunkIndex++,
    });
  }

  if (!fullText.trim()) throw new Error('AI returned empty response');

  const messageId = crypto.randomUUID();
  await db.insert(chatMessages).values({
    id: messageId, conversationId, role: MessageRole.ASSISTANT,
    content: fullText, status: MessageStatus.DELIVERED,
  });

  deps.broadcastEvent(`chat:${conversationId}`, ChatWsEvent.MSG_STREAM_END, {
    type: ChatWsEvent.MSG_STREAM_END, conversationId, tempId, messageId, content: fullText,
  });
}

// ─── Image response ─────────────────────────────────────────────────────────

async function processImageResponse(
  conversationId: string,
  character: ChatCharacter,
  deps: ReturnType<typeof getChatDeps>,
  tempId: string,
  userPrompt: string,
): Promise<void> {
  // Ensure image pipeline is initialized
  initImagePipeline();

  // Broadcast processing status
  deps.broadcastEvent(`chat:${conversationId}`, ChatWsEvent.MSG_IMAGE_PROCESSING, {
    type: ChatWsEvent.MSG_IMAGE_PROCESSING, conversationId, tempId,
  });

  // 1. Run keyword orchestration pipeline
  const orchestrated = orchestratePrompt(userPrompt, character.genderId ?? undefined);

  // 2. Merge bot-level visual defaults
  const traits = {
    ...orchestrated,
    outfits: (orchestrated.outfits ?? []) as number[],
    accessories: (orchestrated.accessories ?? []) as number[],
    poses: (orchestrated.poses ?? []) as number[],
  };

  // 3. Get model preset
  const preset = (character.modelPreset ? getPreset(character.modelPreset) : null) ?? getDefaultPreset();

  // 4. Detect NSFW
  const keywords = orchestrated.keyword_context ?? [];
  const isNsfw = detectNsfw(keywords, orchestrated.custom);

  // 5. Build the full image prompt (SD-formatted)
  const promptData = buildImagePrompt({
    traits: {
      outfits: traits.outfits,
      accessories: traits.accessories,
      poses: traits.poses,
      expression: typeof traits.expression === 'number' ? traits.expression : undefined,
      location: typeof traits.location === 'number' ? traits.location : undefined,
      lighting: typeof traits.lighting === 'number' ? traits.lighting : undefined,
      perspective: typeof traits.perspective === 'number' ? traits.perspective : undefined,
      custom: orchestrated.custom,
      keyword_context: keywords,
      outfitColors: orchestrated.outfitColors,
      accessoryColors: orchestrated.accessoryColors,
    },
    botGenderId: character.genderId,
    botEthnicityId: character.ethnicityId,
    botCustom: null, // No dedicated visual description field yet — use enum traits only
    botCustomNegative: character.customNegative,
    lora: character.loraConfig,
    preset,
    isNsfw,
    hairColorId: character.hairColorId,
    hairTextureId: character.hairTextureId,
    hairStyleId: character.hairStyleId,
    eyesColorId: character.eyesColorId,
    skinId: character.skinId,
    bodyDescriptionId: character.bodyDescriptionId,
  });

  // 6. Generate image via provider (pass the full SD prompt, not raw user text)
  const result = await generateImage(promptData.prompt, {
    width: promptData.width,
    height: promptData.height,
    negativePrompt: promptData.negativePrompt,
  });

  // Store image
  const messageId = crypto.randomUUID();
  const mediaId = crypto.randomUUID();

  // Save to chat_media
  await db.insert(chatMedia).values({
    id: mediaId,
    filename: `${messageId}.jpg`,
    filepath: result.result.url,
    mimeType: 'image/jpeg',
    fileSize: 0,
    width: result.result.width,
    height: result.result.height,
    purpose: 'message',
  });

  // Insert message
  await db.insert(chatMessages).values({
    id: messageId, conversationId, role: MessageRole.ASSISTANT,
    content: '[Image]', status: MessageStatus.DELIVERED, mediaId,
  });

  deps.broadcastEvent(`chat:${conversationId}`, ChatWsEvent.MSG_IMAGE_COMPLETE, {
    type: ChatWsEvent.MSG_IMAGE_COMPLETE, conversationId, tempId, messageId,
    mediaUrl: result.result.url,
    width: result.result.width,
    height: result.result.height,
  });

  dispatchWebhook(db, 'chat.image.generated', { conversationId, messageId });
}

// ─── Video response ─────────────────────────────────────────────────────────

async function processVideoResponse(
  conversationId: string,
  deps: ReturnType<typeof getChatDeps>,
  tempId: string,
): Promise<void> {
  // Find the last generated image in this conversation
  const [lastImage] = await db
    .select({ filepath: chatMedia.filepath, id: chatMedia.id })
    .from(chatMedia)
    .innerJoin(chatMessages, eq(chatMedia.id, chatMessages.mediaId))
    .where(and(
      eq(chatMessages.conversationId, conversationId),
      eq(chatMedia.purpose, 'message'),
    ))
    .orderBy(desc(chatMedia.createdAt))
    .limit(1);

  if (!lastImage) {
    throw new Error('No image found in conversation for video generation. Send an image first.');
  }

  deps.broadcastEvent(`chat:${conversationId}`, ChatWsEvent.MSG_VIDEO_PROCESSING, {
    type: ChatWsEvent.MSG_VIDEO_PROCESSING, conversationId, tempId,
  });

  const result = await generateVideo(lastImage.filepath, {
    prompt: 'Generate a video with natural, fluid motion',
    duration: 5,
  });

  const messageId = crypto.randomUUID();
  const mediaId = crypto.randomUUID();

  await db.insert(chatMedia).values({
    id: mediaId,
    filename: `${messageId}.mp4`,
    filepath: result.result.url,
    mimeType: 'video/mp4',
    fileSize: 0,
    purpose: 'message',
  });

  await db.insert(chatMessages).values({
    id: messageId, conversationId, role: MessageRole.ASSISTANT,
    content: '[Video]', status: MessageStatus.DELIVERED, mediaId,
  });

  deps.broadcastEvent(`chat:${conversationId}`, ChatWsEvent.MSG_VIDEO_COMPLETE, {
    type: ChatWsEvent.MSG_VIDEO_COMPLETE, conversationId, tempId, messageId,
    mediaUrl: result.result.url,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function refundTokens(
  deps: ReturnType<typeof getChatDeps>, orgId: string, amount: number,
  conversationId: string, reason: string,
): Promise<void> {
  try {
    await deps.addTokens(orgId, amount, 'ai_chat_refund', { conversationId, reason });
    logger.info('Tokens refunded', { orgId, amount, reason });
  } catch (err) {
    logger.error('Token refund failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

function broadcastFailed(deps: ReturnType<typeof getChatDeps>, conversationId: string, tempId: string): void {
  deps.broadcastEvent(`chat:${conversationId}`, ChatWsEvent.MSG_STATUS, {
    type: ChatWsEvent.MSG_STATUS, conversationId, tempId, status: MessageStatus.FAILED,
  });
}
