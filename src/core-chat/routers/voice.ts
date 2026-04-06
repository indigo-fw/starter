import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { db } from '@/server/db';
import { chatConversations } from '@/core-chat/schema/conversations';
import { chatVoiceCalls } from '@/core-chat/schema/voice-calls';
import { getChatDeps } from '@/core-chat/deps';

export const voiceRouter = createTRPCRouter({
  /** Pre-flight check before starting a voice call */
  canStartCall: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [conv] = await db
        .select({ userId: chatConversations.userId, organizationId: chatConversations.organizationId })
        .from(chatConversations)
        .where(and(
          eq(chatConversations.id, input.conversationId),
          eq(chatConversations.userId, ctx.session.user.id),
        ))
        .limit(1);

      if (!conv) return { canStart: false, reason: 'Conversation not found' };

      const deps = getChatDeps();
      const balance = await deps.getTokenBalance(conv.organizationId);
      const costPerMinute = 50; // TODO: from options

      if (balance < costPerMinute) {
        return { canStart: false, reason: 'Insufficient tokens for a voice call' };
      }

      return { canStart: true, costPerMinute, balance };
    }),

  /** Get active call status */
  getCallStatus: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ input }) => {
      const { getActiveCall } = await import('@/core-chat/lib/voice/call-handler');
      const call = getActiveCall(input.conversationId);
      if (!call) return { active: false };

      return {
        active: true,
        state: call.state,
        startedAt: call.startedAt,
        durationSeconds: Math.floor((Date.now() - call.startedAt) / 1000),
      };
    }),

  /** Get call history for a conversation */
  callHistory: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      limit: z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      return db
        .select()
        .from(chatVoiceCalls)
        .where(and(
          eq(chatVoiceCalls.conversationId, input.conversationId),
          eq(chatVoiceCalls.userId, ctx.session.user.id),
        ))
        .orderBy(chatVoiceCalls.startedAt)
        .limit(input.limit);
    }),
});
