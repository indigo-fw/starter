// ─── Payment Provider Abstraction ────────────────────────────────────────────

export enum TransactionStatus {
  PENDING = 'pending',
  SUCCESSFUL = 'successful',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED_PRICE = 'fixed_price',
  TRIAL = 'trial',
  FREE_TRIAL = 'free_trial',
}

// ─── Checkout ────────────────────────────────────────────────────────────────

export interface CheckoutParams {
  organizationId: string;
  planId: string;
  interval: 'monthly' | 'yearly';
  successUrl: string;
  cancelUrl: string;
  discountCode?: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
  /** Resolved discount to apply at payment time */
  discount?: DiscountDefinition;
  /** Original price in cents (before discount) */
  originalPriceCents?: number;
  /** Final price in cents (after discount) */
  finalPriceCents?: number;
}

export interface CheckoutResult {
  url: string;
  transactionId?: string;
  providerId: string;
}

// ─── Webhook ─────────────────────────────────────────────────────────────────

export type WebhookEventType =
  | 'subscription.activated'
  | 'subscription.updated'
  | 'subscription.canceled'
  | 'payment.failed'
  | 'payment.refunded';

export interface WebhookEvent {
  type: WebhookEventType;
  organizationId?: string;
  planId?: string;
  status?: string;
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  providerPriceId?: string;
  periodStart?: Date;
  periodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  providerData?: Record<string, unknown>;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export interface PaymentProviderConfig {
  id: string;
  name: string;
  description: string;
  supportsRecurring: boolean;
  enabled: boolean;
  allowedIntervals?: ('monthly' | 'yearly')[];
}

export interface PaymentProvider {
  config: PaymentProviderConfig;
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>;
  handleWebhook(request: Request): Promise<WebhookEvent>;
  createPortalSession?(orgId: string, returnUrl: string): Promise<string>;
  refund?(transactionId: string, amountCents?: number): Promise<boolean>;
}

// ─── Discount ────────────────────────────────────────────────────────────────

export interface DiscountDefinition {
  type: DiscountType;
  /** Percentage (0-100) or fixed price in cents */
  value?: number;
  trialDays?: number;
  trialPriceCents?: number;
}

export interface DiscountValidationResult {
  valid: boolean;
  message?: string;
  discount?: DiscountDefinition;
  finalPriceCents?: number;
}
