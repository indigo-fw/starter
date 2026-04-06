/**
 * Wire core-affiliates module dependencies to project-specific implementations.
 * Imported as a side-effect in server.ts.
 */
import { setAffiliatesDeps } from '@/core-affiliates/deps';
import { saasPaymentTransactions } from '@/core-payments/schema/payments';

setAffiliatesDeps({
  paymentTransactionsTable: saasPaymentTransactions,
  async getRevenueByUsers() {
    // Currently unused — breakdown query uses paymentTransactionsTable directly
    return new Map();
  },
});
