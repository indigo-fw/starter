import type { PricingPlan, PricingFaq } from '@/core/config/pricing';
import { PLANS } from './plans';

export type { PricingPlan, PricingFaq } from '@/core/config/pricing';

/** Convert a price in cents to a display string (e.g. 1900 → "$19", 0 → "$0"). */
function centsToDisplay(cents: number): string {
  if (cents === 0) return '$0';
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}

/**
 * Pricing plans derived from PLANS in plans.ts.
 * All display-layer values (price strings, features list, CTA label, popular flag)
 * come from the single source of truth — no duplication.
 */
export const PRICING_PLANS: PricingPlan[] = PLANS.map((plan) => ({
  id: plan.id,
  name: plan.name,
  description: plan.description,
  priceMonthly: centsToDisplay(plan.priceMonthly),
  priceYearly: centsToDisplay(plan.priceYearly),
  features: plan.displayFeatures,
  cta: plan.cta,
  popular: plan.popular,
}));

export const PRICING_FAQ: PricingFaq[] = [
  {
    question: 'Can I switch plans at any time?',
    answer:
      'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately, and we prorate the difference.',
  },
  {
    question: 'What happens when my trial ends?',
    answer:
      'After your 14-day trial, you can choose to subscribe to a paid plan or continue with the Free plan with limited features.',
  },
  {
    question: 'Do you offer refunds?',
    answer:
      'Yes, we offer a 30-day money-back guarantee. Contact support if you are not satisfied.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit cards (Visa, Mastercard, American Express) through Stripe. We also accept cryptocurrency payments via NOWPayments for yearly plans. Wire transfers are available for Enterprise plans.',
  },
  {
    question: 'Is there a discount for annual billing?',
    answer:
      'Yes! Annual billing saves you roughly 2 months compared to monthly billing.',
  },
];
