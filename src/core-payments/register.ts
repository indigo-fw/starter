/**
 * core-payments module registration entrypoint.
 */

// Routers
export { billingProfileRouter } from './routers/billing-profile';

// Dependencies
export { setPaymentsDeps, getPaymentsDeps } from './deps';
export type { PaymentsDeps, PaymentPlanInfo } from './deps';

// Schema
export {
  saasSubscriptionEvents,
  saasPaymentTransactions,
} from './schema/payments';

export { billingProfiles } from './schema/billing-profile';

// Types
export {
  TransactionStatus,
  DiscountType,
} from './types/payment';
export type {
  PaymentProvider,
  PaymentProviderConfig,
  PaymentMethodType,
  CheckoutParams,
  CheckoutResult,
  WebhookEvent,
  WebhookEventType,
  DiscountDefinition,
  DiscountValidationResult,
  AuthorizeParams,
  AuthorizeResult,
  CaptureParams,
  CaptureResult,
  VoidResult,
  RefundResult,
  StoredPaymentMethod,
  SetupIntentResult,
} from './types/payment';

// Lib — provider factory
export { registerPaymentProvider, getProvider, getDefaultProvider, getEnabledProviders, isBillingEnabled } from './lib/factory';

// Lib — transaction service
export { insertRawTransaction, createAuthorizationTransaction, recordCapture, recordVoid } from './lib/transaction-service';
export type { RawTransactionValues } from './lib/transaction-service';

// Lib — Stripe utilities
export { getStripe, requireStripe, getOrCreateStripeCustomer, syncStripeCustomerAddress } from './lib/stripe';
