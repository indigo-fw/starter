import type { PaymentProviderConfig } from '@/core-payments/types/payment';

export const PAYMENT_PROVIDERS: PaymentProviderConfig[] = [
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Credit card payments via Stripe',
    supportsRecurring: true,
    enabled: !!process.env.STRIPE_SECRET_KEY,
    allowedIntervals: ['monthly', 'yearly'],
  },
  {
    id: 'nowpayments',
    name: 'NOWPayments',
    description: 'Cryptocurrency payments via NOWPayments',
    supportsRecurring: false,
    enabled: !!process.env.NOWPAYMENTS_API_KEY,
    allowedIntervals: ['yearly'],
  },
];

export function getProviderConfig(id: string): PaymentProviderConfig | undefined {
  return PAYMENT_PROVIDERS.find((p) => p.id === id);
}

export function getEnabledProviderConfigs(): PaymentProviderConfig[] {
  return PAYMENT_PROVIDERS.filter((p) => p.enabled);
}
