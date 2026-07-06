/**
 * Wire core-subscriptions module dependencies to project-specific implementations.
 * Imported as a side-effect in server.ts.
 */
import { setSubscriptionsDeps } from '@/core-subscriptions/deps';
import { requireFeature } from '@/core-subscriptions/lib/feature-gate';
import { PLANS, getPlan, getPlanByProviderPriceId, getProviderPriceId } from '@/config/plans';
// Billing mode + token packs (side-effect: calls setBillingConfig)
import '@/config/billing';
import { resolveOrgId } from '@/server/lib/resolve-org';
import { sendOrgNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { enqueueTemplateEmail } from '@/core/lib/email';
import { registerHook } from '@/core/lib/module/module-hooks';
import { getProvider, isBillingEnabled, getEnabledProviders } from '@/core-payments/lib/factory';
import { registerPaymentWebhookHandler } from '@/core-payments/lib/webhook-registry';
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
// Type safety via HookMap — core-owned events (see @/core/lib/module/module-hooks).
registerHook('feature.require', async (orgId, feature, currentUsage) => {
  await requireFeature(orgId, feature, currentUsage as number);
});

// Route one-time 'token_pack' payments from provider webhooks to token grants
registerPaymentWebhookHandler('token_pack', async ({ event, providerId }) => {
  const { handleTokenPackWebhookEvent } = await import('@/core-subscriptions/lib/token-grants');
  return handleTokenPackWebhookEvent({ event, providerId });
});

// ─── Reverse trial (opt-in) ────────────────────────────────────────────────
//
// To give every new signup a no-card, full-tier trial: uncomment the
// setReverseTrialConfig() call and add the two cron jobs in server.ts (see
// core-subscriptions/lib/reverse-trial.ts for the snippet). The user.created
// hook below is harmless when the config is unset (grantReverseTrialOnSignup
// is a no-op), so it stays registered unconditionally.
//
// import { setReverseTrialConfig } from '@/core-subscriptions/lib/reverse-trial';
// setReverseTrialConfig({ plan: 'pro', days: 14 });
import { grantReverseTrialOnSignup } from '@/core-subscriptions/lib/reverse-trial';
import { grantSignupBonusTokens } from '@/core-subscriptions/lib/token-grants';
registerHook('user.created', async (_user, orgId) => {
  await grantReverseTrialOnSignup(orgId);
  // One-time token credit for new orgs (no-op unless BILLING.signupBonusTokens is set)
  await grantSignupBonusTokens(orgId);
});
