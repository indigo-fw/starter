/**
 * core-payments-crypto module registration entrypoint.
 *
 * Registers the NOWPayments crypto payment provider with the core-billing factory.
 * Import this as a side-effect in server.ts to enable crypto payments.
 */
import { registerPaymentProvider } from '@/core-payments/lib/factory';

registerPaymentProvider('nowpayments', async () => {
  if (!process.env.NOWPAYMENTS_API_KEY) return null;
  const { NowPaymentsProvider } = await import('@/core-payments-crypto/providers/nowpayments-provider');
  return new NowPaymentsProvider();
});

// Re-export provider for direct use
export { NowPaymentsProvider } from './providers/nowpayments-provider';
