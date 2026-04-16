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
import { enqueueTemplateEmail } from '@/core/lib/email';
import { registerHook } from '@/core/lib/module/module-hooks';
import { getProvider, isBillingEnabled, getEnabledProviders } from '@/core-payments/lib/factory';
import {
  getTransactionRevenue,
  getRecentTransactionsWithOrg,
  getRevenueOverTime,
  runReconciliation,
} from '@/core-payments/lib/transaction-service';

setSubscriptionsDeps({
  getPlans: () => PLANS,
  getPlan,
  getPlanByProviderPriceId,
  getProviderPriceId,

  resolveOrgId(activeOrgId, userId) {
    return resolveOrgId(activeOrgId, userId);
  },

  sendOrgNotification(orgId, { title, body, type, category, actionUrl }) {
    sendOrgNotification(orgId, {
      title,
      body,
      type: (type as NotificationType) ?? NotificationType.INFO,
      category: (category as NotificationCategory) ?? NotificationCategory.SYSTEM,
      actionUrl,
    });
  },

  enqueueTemplateEmail(to, template, data) {
    return enqueueTemplateEmail(to, template, data as Record<string, string>);
  },

  broadcastEvent(channel, type, payload) {
    import('@/server/lib/ws')
      .then(({ broadcastToChannel }) => broadcastToChannel(channel, type, payload))
      .catch(() => {});
  },

  // Cross-module: payment capabilities (provided by core-payments)
  getTransactionRevenue,
  getRecentTransactions: getRecentTransactionsWithOrg,
  getRevenueOverTime,
  getProvider,
  isBillingEnabled,
  getEnabledProviders,
  runReconciliation,
});

// Cancel subscriptions when a user account is deleted (GDPR).
// Only cancels subscriptions for orgs where the user is the sole member
// (i.e. personal orgs). Shared team orgs are left intact.
// Type safety enforced via HookMap (see core/lib/module/module-hooks.ts).
registerHook('user.beforeDelete', async (userId) => {
  const { db } = await import('@/server/db');
  const { member } = await import('@/server/db/schema/organization');
  const { saasSubscriptions } = await import('@/core-subscriptions/schema/subscriptions');
  const { eq, and, inArray, sql } = await import('drizzle-orm');

  // Find orgs where this user is the ONLY member (personal orgs)
  const soleMemberOrgs = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(100);

  if (soleMemberOrgs.length === 0) return;

  const orgIds = soleMemberOrgs.map((m) => m.organizationId);

  // Filter to orgs with exactly 1 member (this user)
  const soleOrgs = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(inArray(member.organizationId, orgIds))
    .groupBy(member.organizationId)
    .having(sql`count(*) = 1`);

  if (soleOrgs.length === 0) return;

  const soleOrgIds = soleOrgs.map((o) => o.organizationId);

  // Cancel active subscriptions only for sole-member orgs
  await db
    .update(saasSubscriptions)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(
      and(
        inArray(saasSubscriptions.organizationId, soleOrgIds),
        inArray(saasSubscriptions.status, ['active', 'past_due', 'trialing'])
      )
    );
});

// Register feature gate so other modules can call runGuard('feature.require', ...)
// without importing from core-subscriptions directly.
// Type safety enforced via HookMap declaration merging (see core-subscriptions/types/hooks.ts).
registerHook('feature.require', async (orgId, feature, currentUsage) => {
  await requireFeature(orgId, feature, currentUsage as number);
});
