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
import { addTokens, deductTokens, getTokenBalance } from '@/core-subscriptions/lib/token-service';
import { requireFeature } from '@/core-subscriptions/lib/feature-gate';
import { sendNotification } from '@/server/lib/notifications';
import { broadcastToChannel, sendToUser } from '@/server/lib/ws';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { registerChannelAuthorizer } from '@/core/lib/module-hooks';
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
