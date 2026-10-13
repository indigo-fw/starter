/**
 * Approvals-only reconciliation — the fast lane for lost webhooks.
 *
 * The daily sweep (`runReconciliation`, reached through dunning) only looks at
 * PENDING rows past its 24 h stale threshold, so a customer whose webhook was
 * dropped waited up to a day for fulfilment. This job polls the younger rows
 * every half hour and acts on exactly one answer — an explicit provider
 * `successful` — through the same CAS and `reconcile:<txId>` idempotency key
 * the daily sweep uses. It never fails or abandons a row; that judgement stays
 * with the daily sweep, so the two can overlap or race a late webhook safely.
 *
 * Registered from `server.ts` with `registerCronJob` (worker role only) — no
 * side effects on import, so this module is safe to pull in anywhere.
 */
import {
  fulfilRecoveredPayment,
  reconcileRecentApprovals,
} from '@/core-payments/lib/reconciliation-service';
import { getConfiguredProviderChecks } from '@/core-payments/lib/transaction-service';
import {
  saasPaymentTransactions,
  saasSubscriptionEvents,
} from '@/core-payments/schema/payments';
import { createLogger } from '@/core/lib/infra/logger';
import { db } from '@/server/db';

const log = createLogger('reconcile-approvals');

/**
 * Cron definition. Single source of truth: `server.ts` spreads it into
 * `registerCronJob`, so the name and interval are never duplicated. The
 * step-minute pattern is one the DB-queue fallback parser understands, so an
 * install without Redis gets the same cadence.
 */
export const RECONCILE_APPROVALS_CRON = {
  name: 'payments-reconcile-approvals',
  pattern: '*/30 * * * *',
} as const;

/**
 * Age window and batch cap. Rows younger than `minAgeMinutes` are still inside
 * normal webhook delivery delay (polling them mostly races a webhook that is
 * about to land); rows older than `maxAgeHours` are the daily sweep's. The
 * windows are complementary, but nothing depends on that — the CAS does.
 */
export const RECONCILE_APPROVALS_WINDOW = {
  minAgeMinutes: 10,
  maxAgeHours: 24,
  batchSize: 200,
} as const;

/** Cron handler: one approvals-only pass with every configured provider. */
export async function runRecentApprovalsReconciliation(): Promise<void> {
  const providerChecks = getConfiguredProviderChecks();
  if (Object.keys(providerChecks).length === 0) return;

  const result = await reconcileRecentApprovals(
    db,
    saasPaymentTransactions,
    providerChecks,
    {
      ...RECONCILE_APPROVALS_WINDOW,
      fulfil: (recovered) =>
        fulfilRecoveredPayment(recovered, {
          db,
          eventsTable: saasSubscriptionEvents,
        }),
    }
  );

  if (result.fulfilmentFailed > 0) {
    log.error(
      'Approvals reconciliation recovered paid transactions it could not fulfil — see per-row errors above',
      result
    );
  } else if (result.checked > 0) {
    log.info('Approvals reconciliation results', result);
  }
}
