/**
 * Billing model configuration for this install.
 *
 * Pick ONE of three modes:
 *
 *   'subscription'        — recurring plans only, no token accounting.
 *                           Configure plans in `config/plans.ts`; leave
 *                           `monthlyTokens` off the plans.
 *
 *   'subscription-tokens' — recurring plans that drip tokens monthly.
 *                           Set `monthlyTokens` per plan in `config/plans.ts`.
 *                           Yearly subscribers still receive their tokens
 *                           month by month (via the `token-grants` cron),
 *                           not 12× at once. Token packs may additionally be
 *                           sold as top-ups.
 *
 *   'tokens'              — prepaid token packs only. Subscription checkout
 *                           is disabled; users buy packs below and spend
 *                           them until the balance runs out.
 *
 * Grant behavior:
 *   - Balances have two buckets: subscription grants fill the expiring
 *     "plan" bucket; packs, bonuses, and refunds fill the permanent
 *     "purchased" bucket. Spending drains the plan bucket first.
 *   - `resetBalanceOnGrant: true` makes unspent PLAN tokens expire each month
 *     (plan bucket zeroed before the new grant). Purchased tokens are never
 *     expired. Default false = plan tokens roll over.
 *   - `signupBonusTokens` gives every new signup's org a one-time credit so
 *     they can try token-metered features (e.g. AI chat) before paying.
 *   - `yearlyTokenGrant: 'upfront'` gives yearly subscribers monthlyTokens × 12
 *     at the start of each yearly period instead of the default monthly drip.
 *   - `planTokenValidityMonths: N` makes each grant expire N months after it
 *     was issued (per-grant lots, drained soonest-expiry-first). Omit for no
 *     per-grant expiry.
 *   - `grantTokensDuringTrial: false` withholds monthly grants from trialing
 *     subscriptions (card trials and reverse trials) — set it if signup
 *     farming for tokens is a concern. Default true.
 *
 * Imported as a side-effect from `config/deps/subscriptions-deps.ts`.
 */
import { setBillingConfig } from '@/core-subscriptions/lib/billing-config';
import type { BillingConfig, TokenPackDefinition } from '@/core-subscriptions/types/billing';

export const TOKEN_PACKS: TokenPackDefinition[] = [
  {
    id: 'pack-small',
    name: 'Small',
    description: 'A quick top-up',
    tokens: 1_000,
    priceCents: 900, // $9
  },
  {
    id: 'pack-medium',
    name: 'Medium',
    description: 'Best value for regular use',
    tokens: 5_000,
    priceCents: 3_900, // $39
    popular: true,
  },
  {
    id: 'pack-large',
    name: 'Large',
    description: 'For heavy usage',
    tokens: 15_000,
    priceCents: 9_900, // $99
  },
];

export const BILLING: BillingConfig = {
  mode: 'subscription-tokens',
  tokenPacks: TOKEN_PACKS,
  signupBonusTokens: 100,
  resetBalanceOnGrant: false,
  yearlyTokenGrant: 'monthly',
  // planTokenValidityMonths: 12, // uncomment: each grant expires 12 months after issuance
};

setBillingConfig(BILLING);
