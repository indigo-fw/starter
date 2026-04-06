/**
 * core-payments module registration entrypoint.
 */

// Dependencies
export { setPaymentsDeps, getPaymentsDeps } from './deps';
export type { PaymentsDeps, PaymentPlanInfo } from './deps';

// Schema
export {
  saasSubscriptionEvents,
  saasPaymentTransactions,
} from './schema/payments';

// Types
export {
  TransactionStatus,
  DiscountType,
} from './types/payment';
export type {
  PaymentProvider,
  PaymentProviderConfig,
  CheckoutParams,
  CheckoutResult,
  WebhookEvent,
  DiscountDefinition,
  DiscountValidationResult,
} from './types/payment';

// Lib — provider factory
export { registerPaymentProvider, getProvider, getDefaultProvider, getEnabledProviders, isBillingEnabled } from './lib/factory';

// Lib — Stripe utilities
export { getStripe, requireStripe, getOrCreateStripeCustomer } from './lib/stripe';
