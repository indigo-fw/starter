// ─── Payment Provider Abstraction ────────────────────────────────────────────

export enum TransactionStatus {
  PENDING = 'pending',
  AUTHORIZED = 'authorized',
  CAPTURED = 'captured',
  SUCCESSFUL = 'successful',
  FAILED = 'failed',
  VOIDED = 'voided',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
}

export type PaymentMethodType = 'card' | 'bank_transfer' | 'crypto' | 'wallet' | 'bnpl';

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED_PRICE = 'fixed_price',
  TRIAL = 'trial',
  FREE_TRIAL = 'free_trial',
}

// ─── Checkout ────────────────────────────────────────────────────────────────

interface CheckoutParamsBase {
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export interface SubscriptionCheckoutParams extends CheckoutParamsBase {
  mode?: 'subscription';
  organizationId: string;
  planId: string;
  interval: 'monthly' | 'yearly';
  discountCode?: string;
  discount?: DiscountDefinition;
  originalPriceCents?: number;
  finalPriceCents?: number;
}

export interface OneTimeCheckoutParams extends CheckoutParamsBase {
  mode: 'payment';
  /** Amount in cents */
  finalPriceCents: number;
  /** Currency code (defaults to 'usd') */
  currency?: string;
  /** Line item display name */
  productName?: string;
}

export type CheckoutParams = SubscriptionCheckoutParams | OneTimeCheckoutParams;

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
  | 'payment.authorized'
  | 'payment.captured'
  | 'payment.completed'
  | 'payment.failed'
  | 'payment.refunded'
  | 'payment.voided';

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
  capabilities?: {
    authCapture?: boolean;
    partialCapture?: boolean;
    void?: boolean;
    storedPaymentMethods?: boolean;
    partialRefund?: boolean;
  };
}

export interface PaymentProvider {
  config: PaymentProviderConfig;
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>;
  handleWebhook(request: Request): Promise<WebhookEvent>;
  createPortalSession?(orgId: string, returnUrl: string): Promise<string>;

  // Auth/capture flow
  authorize?(params: AuthorizeParams): Promise<AuthorizeResult>;
  capture?(params: CaptureParams): Promise<CaptureResult>;
  void?(providerTxId: string): Promise<VoidResult>;

  // Refund (richer return type)
  refund?(providerTxId: string, amountCents?: number): Promise<RefundResult>;

  // Stored payment methods
  listPaymentMethods?(customerId: string): Promise<StoredPaymentMethod[]>;
  createSetupIntent?(customerId: string): Promise<SetupIntentResult>;
  deletePaymentMethod?(paymentMethodId: string): Promise<boolean>;
}

// ─── Authorization / Capture ────────────────────────────────────────────────

export interface AuthorizeParams {
  amountCents: number;
  currency: string;
  customerId: string;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
  /** Server-initiated payment (no user present) */
  offSession?: boolean;
}

export interface AuthorizeResult {
  providerTxId: string;
  status: 'authorized' | 'requires_action' | 'failed';
  amountCents: number;
  /** Client secret for 3DS confirmation (Stripe) */
  clientSecret?: string;
}

export interface CaptureParams {
  providerTxId: string;
  /** Omit to capture full authorized amount */
  amountCents?: number;
}

export interface CaptureResult {
  providerTxId: string;
  status: 'captured' | 'failed';
  capturedAmountCents: number;
}

export interface VoidResult {
  providerTxId: string;
  status: 'voided' | 'failed';
}

// ─── Refund ─────────────────────────────────────────────────────────────────

export interface RefundResult {
  refundId: string;
  providerTxId: string;
  status: 'pending' | 'succeeded' | 'failed';
  amountCents: number;
}

// ─── Stored Payment Methods ─────────────────────────────────────────────────

export interface StoredPaymentMethod {
  id: string;
  type: PaymentMethodType;
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

export interface SetupIntentResult {
  clientSecret: string;
  setupIntentId: string;
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
