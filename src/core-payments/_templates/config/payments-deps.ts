/**
 * Wire core-payments module dependencies to project-specific implementations.
 * Imported as a side-effect in server.ts.
 */
import { setPaymentsDeps, type PaymentsDeps } from '@/core-payments/deps';
import { getPlan, getPlanByProviderPriceId, getProviderPriceId } from '@/config/plans';
import { getEnabledProviderConfigs } from '@/config/payment-providers';
import { resolveOrgId } from '@/server/lib/resolve-org';

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
});
