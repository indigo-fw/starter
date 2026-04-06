import { z } from 'zod';
import { eq, and, desc, lt, or, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { db } from '@/server/db';
import { chatMessages } from '@/core-chat/schema/messages';
import { chatConversations } from '@/core-chat/schema/conversations';
import { getChatDeps } from '@/core-chat/deps';
import { getChatConfig } from '@/core-chat/config';
import { moderateContent } from '@/core-chat/lib/moderation';
import { enqueueAiResponse } from '@/core-chat/lib/engine';
import { ChatWsEvent, CensorType, ConversationStatus, MessageRole, MessageStatus } from '@/core-chat/lib/types';
import { createLogger } from '@/core/lib/logger';
import { getRedis } from '@/core/lib/redis';
import { logAuditEvent, checkAutoBlock } from '@/core-chat/lib/audit';
import { checkRateLimit, type RateLimitConfig } from '@/core/lib/rate-limit';

const logger = createLogger('chat-messages');

// ─── Rate limiter (Redis-based, fail-open) ──────────────────────────────────

async function applyChatRateLimit(userId: string, config: { max: number; windowSeconds: number }): Promise<void> {
  const redis = getRedis();
  const rlConfig: RateLimitConfig = {
    windowMs: config.windowSeconds * 1000,
    maxRequests: config.max,
  };

  const result = await checkRateLimit(redis, `rl:chat:${userId}`, rlConfig);

  if (!result.allowed) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `You are sending messages too quickly. Try again in ${Math.ceil(result.retryAfterMs / 1000)}s`,
    });
  }
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const messageRouter = createTRPCRouter({
  /**
   * Cursor-paginated message list.
   * Uses composite (createdAt, id) cursor to avoid timestamp collision issues.
   */
  list: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      cursor: z.object({
        createdAt: z.string().datetime(),
        id: z.string().uuid(),
      }).optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const [conv] = await db
        .select({ userId: chatConversations.userId })
        .from(chatConversations)
        .where(eq(chatConversations.id, input.conversationId))
        .limit(1);

      if (!conv || conv.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
      }

      const conditions = [eq(chatMessages.conversationId, input.conversationId)];

      if (input.cursor) {
        // Composite cursor: (createdAt < cursor.createdAt) OR (createdAt = cursor.createdAt AND id < cursor.id)
        const cursorDate = new Date(input.cursor.createdAt);
        conditions.push(
          or(
            lt(chatMessages.createdAt, cursorDate),
            and(
              eq(chatMessages.createdAt, cursorDate),
              sql`${chatMessages.id} < ${input.cursor.id}`,
            ),
          )!,
        );
      }

      const messages = await db
        .select()
        .from(chatMessages)
        .where(and(...conditions))
        .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
        .limit(input.limit + 1);

      const hasMore = messages.length > input.limit;
      if (hasMore) messages.pop();

      // Return in chronological order for display
      messages.reverse();

      const nextCursor = hasMore && messages[0]
        ? { createdAt: messages[0].createdAt!.toISOString(), id: messages[0].id }
        : undefined;

      return { messages, nextCursor };
    }),

  /** Send a message — the hot path */
  send: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      conversationId: z.string().uuid(),
      content: z.string().min(1).max(4000),
      mediaId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const deps = getChatDeps();
      const config = getChatConfig();
      const userId = ctx.session.user.id;

      // 1. Verify conversation ownership + active status
      const [conv] = await db
        .select({
          userId: chatConversations.userId,
          status: chatConversations.status,
          organizationId: chatConversations.organizationId,
          characterId: chatConversations.characterId,
        })
        .from(chatConversations)
        .where(eq(chatConversations.id, input.conversationId))
        .limit(1);

      if (!conv || conv.userId !== userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
      }
      if (conv.status !== ConversationStatus.ACTIVE) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Conversation is not active' });
      }

      // 2. Feature gate + token balance pre-flight
      await deps.requireFeature(conv.organizationId, config.featureKey);

      const balance = await deps.getTokenBalance(conv.organizationId);
      if (balance < config.tokenCostPerMessage) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient token balance. Please upgrade your plan.',
        });
      }

      // 3. Rate limit (Redis-based, fail-open without Redis)
      await applyChatRateLimit(userId, {
        max: config.rateLimitMessages,
        windowSeconds: config.rateLimitWindowSeconds,
      });

      // 4. Content moderation
      const moderationResult = await moderateContent(
        input.content,
        {
          keywords: config.moderationKeywords,
          action: config.moderationAction,
        },
        deps.externalModerate,
        userId,
      );

      if (!moderationResult.passed) {
        // Determine censor type based on whether this was an image request
        const { detectMessageType } = await import('@/core-chat/lib/detect-message-type');
        const msgType = detectMessageType(input.content);
        const censorType = msgType === 'image' ? CensorType.CENSORED_IMAGE : CensorType.CENSORED_TEXT;

        await db.insert(chatMessages).values({
          id: input.id,
          conversationId: input.conversationId,
          role: MessageRole.USER,
          content: input.content,
          status: MessageStatus.MODERATED,
          moderationResult: {
            reason: moderationResult.reason,
            action: moderationResult.action,
            censorType,
          },
        }).onConflictDoNothing();

        deps.broadcastEvent(`chat:${input.conversationId}`, ChatWsEvent.MSG_STATUS, {
          type: ChatWsEvent.MSG_STATUS,
          id: input.id,
          status: MessageStatus.MODERATED,
          censorType,
        });

        // Audit log + auto-block check
        logAuditEvent(userId, 'content_moderated', {
          entityType: 'message',
          entityId: input.id,
          reason: moderationResult.reason,
        });
        checkAutoBlock(userId).then((shouldBlock) => {
          if (shouldBlock) {
            logAuditEvent(userId, 'auto_blocked', { reason: 'Exceeded moderation threshold' });
            // TODO: wire to user ban system when available
          }
        }).catch(() => {});

        return { messageId: input.id, status: MessageStatus.MODERATED as string };
      }

      // 5. Insert user message (idempotent via ON CONFLICT DO NOTHING)
      const userRole = input.mediaId ? MessageRole.USER_IMG : MessageRole.USER;
      await db.insert(chatMessages).values({
        id: input.id,
        conversationId: input.conversationId,
        role: userRole,
        content: input.content,
        status: MessageStatus.DELIVERED,
        mediaId: input.mediaId ?? null,
      }).onConflictDoNothing();

      // 6. Broadcast confirmation
      deps.broadcastEvent(`chat:${input.conversationId}`, ChatWsEvent.MSG_CONFIRMED, {
        type: ChatWsEvent.MSG_CONFIRMED,
        id: input.id,
        conversationId: input.conversationId,
        role: userRole,
        content: input.content,
        status: MessageStatus.DELIVERED,
        createdAt: new Date().toISOString(),
      });

      // 7. Enqueue AI response via BullMQ (falls back to in-process if no Redis)
      enqueueAiResponse({
        conversationId: input.conversationId,
        userId,
        organizationId: conv.organizationId,
        lastUserMessage: input.content,
      });

      return { messageId: input.id, status: MessageStatus.DELIVERED as string };
    }),

  /** Retry a failed AI response */
  retry: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [conv] = await db
        .select({
          userId: chatConversations.userId,
          organizationId: chatConversations.organizationId,
        })
        .from(chatConversations)
        .where(eq(chatConversations.id, input.conversationId))
        .limit(1);

      if (!conv || conv.userId !== userId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
      }

      // Get the last user message for retry
      const [lastMsg] = await db
        .select({ content: chatMessages.content })
        .from(chatMessages)
        .where(and(
          eq(chatMessages.conversationId, input.conversationId),
          eq(chatMessages.role, 'user'),
        ))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);

      enqueueAiResponse({
        conversationId: input.conversationId,
        userId,
        organizationId: conv.organizationId,
        lastUserMessage: lastMsg?.content ?? '',
      });

      return { status: 'dispatched' };
    }),

  /** Report a message */
  report: protectedProcedure
    .input(z.object({
      messageId: z.string().uuid().optional(),
      conversationId: z.string().uuid(),
      text: z.string().min(10).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const { chatReports } = await import('@/core-chat/schema/reports');
      await db.insert(chatReports).values({
        reportedById: ctx.session.user.id,
        messageId: input.messageId,
        conversationId: input.conversationId,
        text: input.text,
      });
      return { success: true };
    }),
});
