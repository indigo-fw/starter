/**
 * Wire core-affiliates module dependencies to project-specific implementations.
 * Imported as a side-effect in server.ts.
 */
import { setAffiliatesDeps } from '@/core-affiliates/deps';
import { recordConversion } from '@/core-affiliates/lib/affiliates';
import { captureAttribution } from '@/core-affiliates/lib/attribution';
import { saasPaymentTransactions } from '@/core-payments/schema/payments';
import { registerHook } from '@/core/lib/module/module-hooks';

setAffiliatesDeps({
  paymentTransactionsTable: saasPaymentTransactions,
  async getRevenueByUsers() {
    // Currently unused — breakdown query uses paymentTransactionsTable directly
    return new Map();
  },
});

// Register affiliate hooks so other modules can call runHook() without direct imports.
registerHook('payment.conversion', async (userId: unknown, referenceId: unknown, amountCents: unknown) => {
  if (typeof userId === 'string' && typeof referenceId === 'string' && typeof amountCents === 'number') {
    await recordConversion(userId, referenceId, amountCents);
  }
});

registerHook('attribution.capture', async (userId: unknown, data: unknown) => {
  if (typeof userId === 'string' && data && typeof data === 'object') {
    await captureAttribution(userId, data as Parameters<typeof captureAttribution>[1]);
  }
});
