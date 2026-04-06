import type { PaymentProvider, PaymentProviderConfig } from '@/core-payments/types/payment';
import { getPaymentsDeps } from '@/core-payments/deps';

const providerCache = new Map<string, PaymentProvider>();

type ProviderFactory = () => Promise<PaymentProvider | null>;
const providerFactories = new Map<string, ProviderFactory>();

/**
 * Register a lazy payment provider factory.
 * Call this once per provider (e.g. at module init time).
 * The factory is only invoked on first use — result is cached.
 */
export function registerPaymentProvider(id: string, factory: ProviderFactory): void {
  providerFactories.set(id, factory);
}

/**
 * Get a payment provider by ID. Lazy-initializes and caches instances.
 * Returns null if the provider is not registered or its factory returns null
 * (e.g. because the required env vars are missing).
 */
export async function getProvider(id: string): Promise<PaymentProvider | null> {
  if (providerCache.has(id)) return providerCache.get(id)!;

  const factory = providerFactories.get(id);
  if (!factory) return null;

  const provider = await factory();
  if (provider) providerCache.set(id, provider);
  return provider;
}

/**
 * Get the default (first enabled) provider.
 */
export async function getDefaultProvider(): Promise<PaymentProvider | null> {
  const configs = getPaymentsDeps().getEnabledProviderConfigs();
  if (configs.length === 0) return null;
  return getProvider(configs[0]!.id);
}

/**
 * Get all enabled provider configs (for UI provider selection).
 */
export function getEnabledProviders(): PaymentProviderConfig[] {
  return getPaymentsDeps().getEnabledProviderConfigs();
}

/**
 * Check if any payment provider is configured.
 */
export function isBillingEnabled(): boolean {
  return getPaymentsDeps().getEnabledProviderConfigs().length > 0;
}

// ── Built-in provider registrations ──────────────────────────────────────────
// Add new providers here without touching getProvider().

registerPaymentProvider('stripe', async () => {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const { StripeProvider } = await import('@/core-payments/providers/stripe-provider');
  return new StripeProvider();
});

// NOWPayments provider registered by core-payments-crypto module (if installed)
