import { eq, and, lt } from 'drizzle-orm';
import { createLogger } from '@/core/lib/infra/logger';

const log = createLogger('reconciliation');

export type ProviderCheckFn = (
  providerTransactionId: string,
) => Promise<'successful' | 'failed' | 'pending'>;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transactionsTable: any,
  providerChecks: Record<string, ProviderCheckFn>,
  options: ReconciliationOptions = {},
): Promise<ReconciliationResult> {
  const { staleThresholdHours = 24 } = options;
  const cutoff = new Date(Date.now() - staleThresholdHours * 60 * 60 * 1000);

  const table = transactionsTable as Record<string, unknown>;

  // Find stale pending transactions
  const stale = await db.select({
    id: table.id,
    providerId: table.providerId,
    providerTransactionId: table.providerTransactionId,
  })
    .from(transactionsTable)
    .where(
      and(
        eq(table.status as never, 'pending'),
        lt(table.createdAt as never, cutoff),
      ),
    )
    .limit(100) as Array<{
      id: string;
      providerId: string;
      providerTransactionId: string | null;
    }>;

  let recovered = 0;
  let failed = 0;

  for (const tx of stale) {
    const check = providerChecks[tx.providerId];
    if (!check || !tx.providerTransactionId) continue;

    try {
      const status = await check(tx.providerTransactionId);
      if (status === 'successful') {
        await db.update(transactionsTable)
          .set({ status: 'completed' } as never)
          .where(eq(table.id as never, tx.id));
        recovered++;
      } else if (status === 'failed') {
        await db.update(transactionsTable)
          .set({ status: 'failed' } as never)
          .where(eq(table.id as never, tx.id));
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
