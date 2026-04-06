/**
 * Wire core-chat module dependencies to project-specific implementations.
 * Imported as a side-effect via module serverInit.
 *
 * REQUIRES: core-subscriptions module (for token billing + feature gates).
 * If core-subscriptions is not installed, this file will fail at build time
 * with a module-not-found error — that is intentional and expected.
 */
import { setChatDeps } from '@/core-chat/deps';
import { resolveOrgId } from '@/server/lib/resolve-org';
import { deductTokens, getTokenBalance } from '@/core-subscriptions/lib/token-service';
import { requireFeature } from '@/core-subscriptions/lib/feature-gate';
import { sendNotification } from '@/server/lib/notifications';
import { broadcastToChannel, sendToUser } from '@/server/lib/ws';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import type { PlanFeatures } from '@/core-subscriptions/types/billing';

setChatDeps({
  resolveOrgId: (activeOrgId, userId) => resolveOrgId(activeOrgId, userId),

  deductTokens: (orgId, amount, reason, metadata) =>
    deductTokens(orgId, amount, reason, metadata),

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
