export enum SubscriptionStatus {
  ACTIVE = 'active',
  TRIALING = 'trialing',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  UNPAID = 'unpaid',
  INCOMPLETE = 'incomplete',
  INCOMPLETE_EXPIRED = 'incomplete_expired',
  PAUSED = 'paused',
}

export interface PlanFeatures {
  /** Max team members per org */
  maxMembers: number;
  /** Max storage in MB */
  maxStorageMb: number;
  /** Custom domain support */
  customDomain: boolean;
  /** API access */
  apiAccess: boolean;
  /** Priority support */
  prioritySupport: boolean;
  /** Extend per-project */
  [key: string]: unknown;
}

export interface ProviderPriceIds {
  monthly?: string;
  yearly?: string;
}

export interface PlanDefinition {
  id: string;
  name: string;
  description: string;
  /**
   * Provider-specific price IDs.
   * Stripe: { monthly: 'price_xxx', yearly: 'price_yyy' }
   * NOWPayments (no price IDs): { yearly: '' } — empty string = available at plan.priceYearly
   */
  providerPrices: Record<string, ProviderPriceIds>;
  priceMonthly: number; // in cents
  priceYearly: number; // in cents
  trialDays?: number;
  features: PlanFeatures;
  popular?: boolean;
}
