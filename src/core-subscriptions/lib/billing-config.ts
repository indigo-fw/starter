/**
 * Billing mode configuration — which of the three billing models this
 * install uses ('subscription' | 'subscription-tokens' | 'tokens'), plus
 * purchasable token packs and grant behavior.
 *
 * The project sets this in `src/config/billing.ts` (imported as a
 * side-effect from `config/deps/subscriptions-deps.ts`). When never set,
 * the default is plain 'subscription' mode with no packs — identical to
 * the pre-billing-mode behavior.
 */
import type { BillingConfig, TokenPackDefinition } from '@/core-subscriptions/types/billing';

const DEFAULT_CONFIG: BillingConfig = { mode: 'subscription' };

let config: BillingConfig = DEFAULT_CONFIG;

export function setBillingConfig(cfg: BillingConfig): void {
  config = cfg;
}

export function getBillingConfig(): BillingConfig {
  return config;
}

/** Reset to the unconfigured default. Primary use is in tests. */
export function clearBillingConfig(): void {
  config = DEFAULT_CONFIG;
}

export function getTokenPack(packId: string): TokenPackDefinition | undefined {
  return config.tokenPacks?.find((p) => p.id === packId);
}
