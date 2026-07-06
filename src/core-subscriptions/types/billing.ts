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
  /**
   * Tokens granted every month while the subscription is active/trialing.
   * Granted monthly regardless of billing interval — a yearly subscriber
   * receives 12 monthly grants, not 12× up front. Omit for no grants.
   */
  monthlyTokens?: number;
  features: PlanFeatures;
  popular?: boolean;
}

// ─── Billing mode ────────────────────────────────────────────────────────────

/**
 * How this install charges customers:
 * - 'subscription'        — recurring plans only, no token accounting
 * - 'subscription-tokens' — recurring plans + monthly token grants (`plan.monthlyTokens`)
 * - 'tokens'              — prepaid token packs only, no recurring plans
 */
export type BillingMode = 'subscription' | 'subscription-tokens' | 'tokens';

export interface TokenPackDefinition {
  id: string;
  name: string;
  description?: string;
  /** Tokens credited on purchase */
  tokens: number;
  /** One-time price in cents */
  priceCents: number;
  popular?: boolean;
}

export interface BillingConfig {
  mode: BillingMode;
  /** One-time purchasable token packs. Empty/omitted = pack sales disabled. */
  tokenPacks?: TokenPackDefinition[];
  /** Tokens granted once to every new signup's org (via the user.created hook). */
  signupBonusTokens?: number;
  /**
   * true = unspent PLAN tokens expire: the plan bucket (and any grant lots)
   * is zeroed before each new grant. Purchased tokens are never expired.
   * Default false = plan tokens roll over and accumulate.
   */
  resetBalanceOnGrant?: boolean;
  /**
   * How yearly-interval subscriptions receive their tokens:
   * - 'monthly' (default) — 12 monthly drips of plan.monthlyTokens
   * - 'upfront'           — monthlyTokens × 12 once per yearly period
   * Monthly-interval subscriptions are unaffected.
   */
  yearlyTokenGrant?: 'monthly' | 'upfront';
  /**
   * Per-grant validity window: each subscription grant expires this many
   * months after being issued (tracked as an expiry lot, drained
   * soonest-expiry-first). Omit for no per-grant expiry. Independent of
   * `resetBalanceOnGrant`, which expires everything at the next grant.
   */
  planTokenValidityMonths?: number;
  /**
   * Whether trialing subscriptions (card trials and no-card reverse trials)
   * receive monthly token grants. Default true — trials should feel like the
   * real plan. Set false if signup-farming for tokens is a concern; trials
   * then run on `signupBonusTokens` alone until first payment.
   */
  grantTokensDuringTrial?: boolean;
}
