/**
 * Wire core-payments module dependencies to project-specific implementations.
 * Imported as a side-effect in server.ts.
 */
import { setPaymentsDeps, type PaymentsDeps } from '@/core-payments/deps';
import { billingProfiles } from '@/core-payments/schema/billing-profile';
import { registerHook } from '@/core/lib/module/module-hooks';
import { db } from '@/server/db';
import { getPlan, getPlanByProviderPriceId, getProviderPriceId } from '@/config/plans';
import { getEnabledProviderConfigs } from '@/config/payment-providers';
import { resolveOrgId } from '@/server/lib/resolve-org';
import { getSubscription } from '@/core-subscriptions/lib/subscription-service';

// Seed a billing profile for every newly created organization. Lives here (a
// core-payments project file) so the organizations router never imports
// module schemas — `indigo remove core-payments` stays mechanical.
registerHook('org.created', async (orgId, name) => {
  await db.insert(billingProfiles).values({
    organizationId: orgId,
    legalName: name,
  });
});

setPaymentsDeps({
  getEnabledProviderConfigs,
  getPlan: getPlan as PaymentsDeps['getPlan'],
  getPlanByProviderPriceId: getPlanByProviderPriceId as PaymentsDeps['getPlanByProviderPriceId'],
  getProviderPriceId: getProviderPriceId as PaymentsDeps['getProviderPriceId'],

  resolveOrgId(activeOrgId, userId) {
    return resolveOrgId(activeOrgId, userId);
  },

  broadcastEvent(channel, type, payload) {
    import('@/server/lib/ws')
      .then(({ broadcastToChannel }) => broadcastToChannel(channel, type, payload))
      .catch(() => {});
  },

  // Cross-module: subscription lookup for Stripe customer reuse
  async getActiveSubscriptionForOrg(orgId) {
    const sub = await getSubscription(orgId);
    return sub ? { providerCustomerId: sub.providerCustomerId ?? null } : null;
  },
});
