import type { PlanDefinition } from '@/core-subscriptions/types/billing';

/**
 * Extended plan definition with display-layer fields used to derive pricing.ts.
 * displayFeatures: human-readable bullet points shown on the pricing page.
 * cta: call-to-action button label shown on the pricing card.
 */
export interface ExtendedPlanDefinition extends PlanDefinition {
  displayFeatures: string[];
  cta: string;
}

export const PLANS: ExtendedPlanDefinition[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'For personal projects and trying things out',
    providerPrices: {},
    priceMonthly: 0,
    priceYearly: 0,
    features: {
      maxMembers: 1,
      maxStorageMb: 100,
      customDomain: false,
      apiAccess: false,
      prioritySupport: false,
    },
    displayFeatures: ['1 team member', '100 MB storage', 'Community support', 'Basic CMS features'],
    cta: 'Get Started',
  },
  {
    id: 'starter',
    name: 'Starter',
    description: 'For small teams getting started',
    providerPrices: {
      stripe: {
        monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? '',
        yearly: process.env.STRIPE_PRICE_STARTER_YEARLY ?? '',
      },
      // NOWPayments uses plan.priceYearly directly — no provider-specific price IDs
      nowpayments: { yearly: '' },
    },
    priceMonthly: 1900, // $19
    priceYearly: 19000, // $190
    trialDays: 14,
    features: {
      maxMembers: 5,
      maxStorageMb: 1024,
      customDomain: false,
      apiAccess: true,
      prioritySupport: false,
    },
    displayFeatures: ['5 team members', '1 GB storage', 'API access', 'Email support', 'All CMS features'],
    cta: 'Start Free Trial',
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For growing teams that need more',
    providerPrices: {
      stripe: {
        monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? '',
        yearly: process.env.STRIPE_PRICE_PRO_YEARLY ?? '',
      },
      nowpayments: { yearly: '' },
    },
    priceMonthly: 4900, // $49
    priceYearly: 49000, // $490
    trialDays: 14,
    features: {
      maxMembers: 20,
      maxStorageMb: 10240,
      customDomain: true,
      apiAccess: true,
      prioritySupport: false,
    },
    displayFeatures: [
      '20 team members',
      '10 GB storage',
      'Custom domain',
      'API access',
      'Priority email support',
      'Advanced analytics',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large teams with advanced needs',
    providerPrices: {
      stripe: {
        monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY ?? '',
        yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY ?? '',
      },
      nowpayments: { yearly: '' },
    },
    priceMonthly: 9900, // $99
    priceYearly: 99000, // $990
    features: {
      maxMembers: 100,
      maxStorageMb: 102400,
      customDomain: true,
      apiAccess: true,
      prioritySupport: true,
    },
    displayFeatures: [
      '100 team members',
      '100 GB storage',
      'Custom domain',
      'API access',
      'Priority support',
      'SLA guarantee',
      'SSO',
    ],
    cta: 'Contact Sales',
  },
];

export function getPlan(id: string): ExtendedPlanDefinition | undefined {
  return PLANS.find((p) => p.id === id);
}

/** Look up a plan by provider-specific price ID */
export function getPlanByProviderPriceId(
  providerId: string,
  priceId: string
): ExtendedPlanDefinition | undefined {
  return PLANS.find((p) => {
    const prices = p.providerPrices[providerId];
    if (!prices) return false;
    return prices.monthly === priceId || prices.yearly === priceId;
  });
}

/** Get the price ID for a plan + provider + interval */
export function getProviderPriceId(
  plan: PlanDefinition,
  providerId: string,
  interval: 'monthly' | 'yearly'
): string | null {
  const prices = plan.providerPrices[providerId];
  if (!prices) return null;
  return prices[interval] ?? null;
}

export function getFreePlan(): ExtendedPlanDefinition {
  return PLANS[0]!;
}

// ─── Register plan resolver for engine's feature-gate ──────────────────────
import { setPlanResolver } from '@/core-subscriptions/lib/feature-gate';
setPlanResolver({ getPlan, getFreePlan });
