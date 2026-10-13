/**
 * Wire core-payments module dependencies to project-specific implementations.
 * Imported as a side-effect in server.ts.
 */
import { getEnabledProviderConfigs } from '@/config/payment-providers';
import {
  getPlan,
  getPlanByProviderPriceId,
  getProviderPriceId,
} from '@/config/plans';
import { type PaymentsDeps, setPaymentsDeps } from '@/core-payments/deps';
import { resolveOrgId } from '@/server/lib/resolve-org';

setPaymentsDeps({
  getEnabledProviderConfigs,
  getPlan: getPlan as PaymentsDeps['getPlan'],
  getPlanByProviderPriceId:
    getPlanByProviderPriceId as PaymentsDeps['getPlanByProviderPriceId'],
  getProviderPriceId: getProviderPriceId as PaymentsDeps['getProviderPriceId'],

  resolveOrgId(activeOrgId, userId) {
    return resolveOrgId(activeOrgId, userId);
  },

  broadcastEvent(channel, type, payload) {
    import('@/server/lib/ws')
      .then(({ broadcastToChannel }) =>
        broadcastToChannel(channel, type, payload)
      )
      .catch(() => {});
  },

  // Reconciliation fulfils a recovered subscription payment through this seam
  // (dispatchPaymentEvent falls back to it when no one-time registry handler
  // claims the event). Lazy import: core-subscriptions is optional — remove this
  // entry if that module is not installed.
  handleSubscriptionWebhookEvent: (params) =>
    import('@/core-subscriptions/lib/webhook-handler').then((m) =>
      m.handleSubscriptionWebhookEvent(params)
    ),
});
