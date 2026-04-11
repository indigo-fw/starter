/**
 * Wire core-subscriptions module dependencies to project-specific implementations.
 * Imported as a side-effect in server.ts.
 */
import { setSubscriptionsDeps } from '@/core-subscriptions/deps';
import { requireFeature } from '@/core-subscriptions/lib/feature-gate';
import { PLANS, getPlan, getPlanByProviderPriceId, getProviderPriceId } from '@/config/plans';
import { resolveOrgId } from '@/server/lib/resolve-org';
import { sendOrgNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { enqueueTemplateEmail, type TemplateName } from '@/server/jobs/email/index';
import { registerHook } from '@/core/lib/module/module-hooks';

setSubscriptionsDeps({
  getPlans: () => PLANS,
  getPlan,
  getPlanByProviderPriceId,
  getProviderPriceId,

  resolveOrgId(activeOrgId, userId) {
    return resolveOrgId(activeOrgId, userId);
  },

  sendOrgNotification(orgId, { title, body, actionUrl }) {
    sendOrgNotification(orgId, {
      title,
      body,
      type: NotificationType.INFO,
      category: NotificationCategory.SYSTEM,
      actionUrl,
    });
  },

  enqueueTemplateEmail(to, template, data) {
    return enqueueTemplateEmail(to, template as TemplateName, data as Record<string, string>);
  },

  broadcastEvent(channel, type, payload) {
    import('@/server/lib/ws')
      .then(({ broadcastToChannel }) => broadcastToChannel(channel, type, payload))
      .catch(() => {});
  },
});

// Register feature gate so other modules can call runGuard('feature.require', ...)
// without importing from core-subscriptions directly.
registerHook('feature.require', async (orgId: unknown, feature: unknown, currentUsage: unknown) => {
  if (typeof orgId === 'string' && typeof feature === 'string') {
    await requireFeature(orgId, feature, currentUsage as number);
  }
});
