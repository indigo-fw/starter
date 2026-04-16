/**
 * Wire core-affiliates module dependencies to project-specific implementations.
 * Imported as a side-effect in server.ts.
 */
import { setAffiliatesDeps } from '@/core-affiliates/deps';
import { recordConversion } from '@/core-affiliates/lib/affiliates';
import { captureAttribution } from '@/core-affiliates/lib/attribution';
import { saasPaymentTransactions } from '@/core-payments/schema/payments';
import { registerHook } from '@/core/lib/module/module-hooks';
import { getRevenueByUsers } from '@/core-payments/lib/transaction-service';

setAffiliatesDeps({
  paymentTransactionsTable: saasPaymentTransactions,
  getRevenueByUsers,
});

// Register affiliate hooks so other modules can call runHook() without direct imports.
// Type safety enforced via HookMap declaration merging (see core-affiliates/types/hooks.ts).
registerHook('payment.conversion', async (userId, referenceId, amountCents) => {
  await recordConversion(userId, referenceId, amountCents);
});

registerHook('attribution.capture', async (userId, data) => {
  await captureAttribution(userId, data);
});
