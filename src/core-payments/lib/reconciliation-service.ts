/**
 * Reconciliation sweep for payments whose webhook never arrived.
 *
 * Scope: this marks the transaction row (`successful` / `failed`) so revenue
 * reports and the admin ledger are right. It does NOT fulfil — no plan
 * activation, token grant or notification is dispatched for a recovered
 * payment. Fulfilment is driven by the provider webhook event, which the
 * reconciliation API poll cannot reconstruct. Ops: a `recovered` count > 0
 * means money was taken for an order that may still need manual fulfilment.
 */
import { and, eq, lt } from 'drizzle-orm';

import type { saasPaymentTransactions } from '@/core-payments/schema/payments';
import { TransactionStatus } from '@/core-payments/types/payment';
import { createLogger } from '@/core/lib/infra/logger';
import type { DrizzleDB } from '@/server/db';

const log = createLogger('reconciliation');

export type ProviderCheckFn = (
  providerTransactionId: string
) => Promise<'successful' | 'failed' | 'pending'>;

type TransactionsTable = typeof saasPaymentTransactions;

interface ReconciliationOptions {
  /** How old (in hours) a pending transaction must be to check. Default: 24 */
  staleThresholdHours?: number;
}

export interface ReconciliationResult {
  checked: number;
  recovered: number;
  failed: number;
  [key: string]: number;
}

/**
 * Find pending payment transactions older than the threshold and check their
 * status with the payment provider. Update accordingly.
 */
export async function reconcileStalePendingTransactions(
  db: DrizzleDB,
  transactionsTable: TransactionsTable,
  providerChecks: Record<string, ProviderCheckFn>,
  options: ReconciliationOptions = {}
): Promise<ReconciliationResult> {
  const { staleThresholdHours = 24 } = options;
  const cutoff = new Date(Date.now() - staleThresholdHours * 60 * 60 * 1000);

  const stale = await db
    .select({
      id: transactionsTable.id,
      providerId: transactionsTable.providerId,
      providerTxId: transactionsTable.providerTxId,
    })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.status, TransactionStatus.PENDING),
        lt(transactionsTable.createdAt, cutoff)
      )
    )
    .limit(100);

  let recovered = 0;
  let failed = 0;

  // The provider poll takes seconds; a late webhook can land in between and
  // already move the row. Guarding on `status = pending` means the webhook
  // (which does fulfil) always wins and the sweep never overwrites it.
  const settleIfStillPending = async (
    id: string,
    status: TransactionStatus
  ): Promise<boolean> => {
    const rows = await db
      .update(transactionsTable)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(transactionsTable.id, id),
          eq(transactionsTable.status, TransactionStatus.PENDING)
        )
      )
      .returning({ id: transactionsTable.id });
    return rows.length > 0;
  };

  for (const tx of stale) {
    const check = providerChecks[tx.providerId];
    if (!check || !tx.providerTxId) continue;

    try {
      const status = await check(tx.providerTxId);
      if (status === 'successful') {
        if (await settleIfStillPending(tx.id, TransactionStatus.SUCCESSFUL)) {
          recovered++;
          log.warn(
            'Reconciliation recovered a paid transaction without a webhook — fulfilment not dispatched',
            {
              transactionId: tx.id,
              providerId: tx.providerId,
            }
          );
        }
      } else if (status === 'failed') {
        if (await settleIfStillPending(tx.id, TransactionStatus.FAILED))
          failed++;
      }
      // 'pending' = still waiting, leave as-is
    } catch (err) {
      log.error('Reconciliation check failed', {
        transactionId: tx.id,
        providerId: tx.providerId,
        error: String(err),
      });
    }
  }

  return { checked: stale.length, recovered, failed };
}
