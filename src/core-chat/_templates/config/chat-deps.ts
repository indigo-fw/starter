/**
 * Wire core-chat module dependencies to project-specific implementations.
 * Imported as a side-effect via module serverInit.
 *
 * REQUIRES: core-subscriptions module (for token billing + feature gates).
 * If core-subscriptions is not installed, this file will fail at build time
 * with a module-not-found error — that is intentional and expected.
 */
import { setChatDeps } from '@/core-chat/deps';
import { chatConversations } from '@/core-chat/schema/conversations';
import { initImagePipeline } from '@/core-chat/lib/image/init';
import { resolveOrgId } from '@/server/lib/resolve-org';

// Initialize image orchestration pipeline (builds enum index, configures normalizer)
initImagePipeline();

// Register presets (project decides which to use — comment out to disable)
import '@/config/chat-presets';
import { addTokens, deductTokens, getTokenBalance } from '@/core-subscriptions/lib/token-service';
import { requireFeature } from '@/core-subscriptions/lib/feature-gate';
import { sendNotification } from '@/server/lib/notifications';
import { broadcastToChannel, sendToUser } from '@/server/lib/ws';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { registerChannelAuthorizer, registerHook } from '@/core/lib/module-hooks';
import { Policy } from '@/core/policy';
import { db } from '@/server/db';
import { eq } from 'drizzle-orm';
import { user as userTable } from '@/server/db/schema/auth';
import type { PlanFeatures } from '@/core-subscriptions/types/billing';

setChatDeps({
  resolveOrgId: (activeOrgId, userId) => resolveOrgId(activeOrgId, userId),

  deductTokens: (orgId, amount, reason, metadata) =>
    deductTokens(orgId, amount, reason, metadata),

  addTokens: (orgId, amount, reason, metadata) =>
    addTokens(orgId, amount, reason, metadata),

  getTokenBalance: (orgId) => getTokenBalance(orgId),

  requireFeature: (orgId, feature) =>
    requireFeature(orgId, feature as keyof PlanFeatures),

  broadcastEvent: (channel, type, payload) =>
    broadcastToChannel(channel, type, payload),

  sendToUser: (userId, type, payload) =>
    sendToUser(userId, type, payload),

  sendNotification: ({ userId, title, body, actionUrl }) =>
    sendNotification({
      userId,
      title,
      body,
      type: NotificationType.INFO,
      category: NotificationCategory.SYSTEM,
      actionUrl,
    }),

  // Optional: plug in external moderation (e.g. OpenAI moderation API)
  // externalModerate: async (content, userId) => { ... },
});

// ─── WebSocket channel authorization ────────────────────────────────────────

registerChannelAuthorizer(async (userId, channel) => {
  // chat:<conversationId> — conversation owner or staff
  if (channel.startsWith('chat:')) {
    if (!userId) return false;
    const conversationId = channel.slice(5);
    try {
      const [conv] = await db
        .select({ userId: chatConversations.userId })
        .from(chatConversations)
        .where(eq(chatConversations.id, conversationId))
        .limit(1);
      if (!conv) return false;
      if (conv.userId === userId) return true;
      const [u] = await db
        .select({ role: userTable.role })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);
      return !!u && Policy.for(u.role).can('section.settings');
    } catch {
      return false;
    }
  }

  return null; // not our channel
});

// ─── Voice call WS message handler ─────────────────────────────────────────

registerHook('ws.message', async (userId: unknown, msg: unknown) => {
  const message = msg as { type?: string; payload?: Record<string, unknown> };
  if (!message.type?.startsWith('voice_call_') || !userId) return;

  const conversationId = message.payload?.conversation_id as string;
  if (!conversationId) return;

  const { startCall, handleAudioChunk, handleInterrupt, endCall } =
    await import('@/core-chat/lib/voice/call-handler');

  const broadcastFn = (channel: string, type: string, payload: Record<string, unknown>) =>
    broadcastToChannel(channel, type, payload);

  switch (message.type) {
    case 'voice_call_start':
      await startCall(conversationId, userId as string, broadcastFn);
      break;
    case 'voice_call_audio_chunk': {
      const audioBase64 = message.payload?.audio as string | undefined;
      const isFinal = message.payload?.is_final as boolean;
      if (audioBase64) {
        const bytes = Buffer.from(audioBase64, 'base64');
        const audio = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
        handleAudioChunk(conversationId, audio, isFinal, broadcastFn);
      } else if (isFinal) {
        handleAudioChunk(conversationId, new Int16Array(0), true, broadcastFn);
      }
      break;
    }
    case 'voice_call_interrupt':
      handleInterrupt(conversationId);
      break;
    case 'voice_call_end':
      await endCall(conversationId, 'user_hangup', broadcastFn);
      break;
  }
});
