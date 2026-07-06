/**
 * core-subscriptions module registration entrypoint.
 */

// Dependencies
export { setSubscriptionsDeps, getSubscriptionsDeps } from './deps';
export type { SubscriptionsDeps } from './deps';

// Routers
export { billingRouter } from './routers/billing';
export { discountCodesRouter } from './routers/discount-codes';

// Schema
export {
  saasSubscriptions,
  saasDiscountCodes,
  saasDiscountUsages,
  saasTokenBalances,
  saasTokenLots,
  saasTokenTransactions,
} from './schema/subscriptions';

// Types
export type {
  PlanDefinition,
  PlanFeatures,
  ProviderPriceIds,
  BillingMode,
  BillingConfig,
  TokenPackDefinition,
} from './types/billing';
export { SubscriptionStatus } from './types/billing';

// Lib — subscription lifecycle
export { activateSubscription, updateSubscription, cancelSubscription, getSubscription, getOrgByProviderSubscription } from './lib/subscription-service';
export { validateCode, applyDiscount, removeDiscount, finalizeUsage, getActiveDiscount } from './lib/discount-service';
export { setPlanResolver, getPlanFeatures, checkFeature, requireFeature } from './lib/feature-gate';
export { getTokenBalance, getTokenBalanceRecord, addTokens, deductTokens, expirePlanTokens, expireDueTokenLots, broadcastTokenBalance, getTokenTransactions } from './lib/token-service';
export { setBillingConfig, getBillingConfig } from './lib/billing-config';
export { grantSubscriptionTokensForOrg, runTokenGrantChecks, grantSignupBonusTokens, handleTokenPackWebhookEvent } from './lib/token-grants';

// Lib — webhook handler
export { handleSubscriptionWebhookEvent } from './lib/webhook-handler';
export type { SubscriptionWebhookParams } from './lib/webhook-handler';

// Lib — dunning
export { runDunningChecks } from './lib/dunning';
