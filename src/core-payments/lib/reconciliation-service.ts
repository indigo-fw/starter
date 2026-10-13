/**
 * Reconciliation sweep for payments whose webhook never arrived.
 *
 * The transaction row is the state machine: every status write here is a
 * compare-and-set on `status = pending`, so a late webhook (which also
 * fulfils) always wins and the sweep never overwrites it. A row this sweep
 * moves to SUCCESSFUL is then fulfilled through the SAME dispatch the provider
 * webhook routes use (`dispatchPaymentEvent`: registry handler by
 * `metadata.type`, else the subscription handler) — the customer paid, so a
 * ledger that says "successful" while nothing was delivered is the one
 * outcome this must never produce.
 *
 * Rows the provider cannot confirm within `abandonAfterHours` close as FAILED
 * with `rawResponse.reconciliation.outcome = 'abandoned'`, so they stop
 * haunting the pending queue and revenue stays honest. A provider webhook
 * that lands afterwards may still resurrect them (the NOWPayments provider
 * does); a transient provider/API error never abandons anything — only an
 * explicit provider answer does.
 */
import { and, eq, lt } from 'drizzle-orm';

import {
  dispatchPaymentEvent,
  getPaymentWebhookHandler,
} from '@/core-payments/lib/webhook-registry';
import type {
  saasPaymentTransactions,
  saasSubscriptionEvents,
} from '@/core-payments/schema/payments';
import {
  TransactionStatus,
  type WebhookEvent,
} from '@/core-payments/types/payment';
import { isDuplicateKeyError } from '@/core/crud/drizzle-utils';
import { createLogger } from '@/core/lib/infra/logger';
import type { DrizzleDB } from '@/server/db';

const log = createLogger('reconciliation');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ─── Provider check contract ────────────────────────────────────────────────

/**
 * `pending` is the provider's explicit "not paid yet"; `unknown` means the
 * check could not get an answer (rate limit, auth, outage). Only `pending`
 * ages into abandonment — abandoning on an outage would fail real payments.
 */
export type ProviderCheckStatus =
  'successful' | 'failed' | 'pending' | 'unknown';

export interface ProviderCheckResult {
  status: ProviderCheckStatus;
  /** Provider's id for the payment — fills `providerTxId` on rows recovered by merchant reference. */
  providerTxId?: string;
  /** Raw provider object; becomes the synthesised event's `providerData` and the row's `rawResponse`. */
  providerData?: Record<string, unknown>;
  /** Provider-specific fields the webhook would have put on the event (customer id, period, …). */
  event?: Partial<Omit<WebhookEvent, 'type' | 'providerData'>>;
}

/** The transaction columns a checker and the fulfilment step can see. */
export interface ReconcilableTransaction {
  id: string;
  organizationId: string;
  userId: string | null;
  providerId: string;
  providerTxId: string | null;
  amountCents: number;
  currency: string;
  planId: string | null;
  interval: string | null;
  rawRequest: unknown;
  createdAt: Date;
}

export type ProviderCheckFn = (
  providerTransactionId: string,
  tx: ReconcilableTransaction
) => Promise<ProviderCheckStatus | ProviderCheckResult>;

export interface ProviderChecker {
  check: ProviderCheckFn;
  /**
   * Look the payment up by OUR transaction id (what the provider was given as
   * order / merchant / client reference). `null` = the provider has no record
   * of it. Lets a captured-but-lost-response charge be recovered instead of
   * abandoned; providers without such a lookup simply omit it.
   */
  findByMerchantReference?: (
    tx: ReconcilableTransaction
  ) => Promise<ProviderCheckResult | null>;
}

export type ProviderCheck = ProviderCheckFn | ProviderChecker;

export interface RecoveredTransaction {
  tx: ReconcilableTransaction;
  check: ProviderCheckResult;
}

type TransactionsTable = typeof saasPaymentTransactions;
type EventsTable = typeof saasSubscriptionEvents;

export interface ReconciliationOptions {
  /** How old (in hours) a pending transaction must be to check. Default: 24 */
  staleThresholdHours?: number;
  /**
   * How old (in hours) a pending transaction must be before an explicit
   * provider `pending` (or no provider record at all) closes it as FAILED.
   * Default: 24
   */
  abandonAfterHours?: number;
  /**
   * Deliver what the customer paid for; runs once per row that THIS sweep
   * moved to SUCCESSFUL. Omitted = mark only (logged as a warning per row).
   */
  fulfil?: (recovered: RecoveredTransaction) => Promise<void>;
}

export interface ReconciliationResult {
  checked: number;
  recovered: number;
  failed: number;
  abandoned: number;
  /** Rows marked SUCCESSFUL whose fulfilment threw — money taken, manual fulfilment needed. */
  fulfilmentFailed: number;
  [key: string]: number;
}

type ReconciliationOutcome = 'recovered' | 'failed' | 'abandoned';

function reconciliationNote(outcome: ReconciliationOutcome, reason?: string) {
  return {
    outcome,
    ...(reason && { reason }),
    at: new Date().toISOString(),
  };
}

function normaliseCheck(
  result: ProviderCheckStatus | ProviderCheckResult
): ProviderCheckResult {
  return typeof result === 'string' ? { status: result } : result;
}

function asChecker(
  check: ProviderCheck | undefined
): ProviderChecker | undefined {
  if (!check) return undefined;
  return typeof check === 'function' ? { check } : check;
}

/**
 * Find pending payment transactions older than the threshold and check their
 * status with the payment provider. Update accordingly and fulfil recoveries.
 */
export async function reconcileStalePendingTransactions(
  db: DrizzleDB,
  transactionsTable: TransactionsTable,
  providerChecks: Record<string, ProviderCheck>,
  options: ReconciliationOptions = {}
): Promise<ReconciliationResult> {
  const { staleThresholdHours = 24, abandonAfterHours = 24, fulfil } = options;
  const now = Date.now();
  const cutoff = new Date(now - staleThresholdHours * HOUR_MS);
  const abandonCutoff = new Date(now - abandonAfterHours * HOUR_MS);

  const stale: ReconcilableTransaction[] = await db
    .select({
      id: transactionsTable.id,
      organizationId: transactionsTable.organizationId,
      userId: transactionsTable.userId,
      providerId: transactionsTable.providerId,
      providerTxId: transactionsTable.providerTxId,
      amountCents: transactionsTable.amountCents,
      currency: transactionsTable.currency,
      planId: transactionsTable.planId,
      interval: transactionsTable.interval,
      rawRequest: transactionsTable.rawRequest,
      createdAt: transactionsTable.createdAt,
    })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.status, TransactionStatus.PENDING),
        lt(transactionsTable.createdAt, cutoff)
      )
    )
    .limit(100);

  const result: ReconciliationResult = {
    checked: stale.length,
    recovered: 0,
    failed: 0,
    abandoned: 0,
    fulfilmentFailed: 0,
  };

  // The provider poll takes seconds; a late webhook can land in between and
  // already move the row. Guarding on `status = pending` means the webhook
  // (which does fulfil) always wins and the sweep never overwrites it.
  const settleIfStillPending = async (
    id: string,
    status: TransactionStatus,
    rawResponse: Record<string, unknown>,
    providerTxId?: string
  ): Promise<boolean> => {
    const rows = await db
      .update(transactionsTable)
      .set({
        status,
        rawResponse,
        updatedAt: new Date(),
        ...(providerTxId && { providerTxId }),
      })
      .where(
        and(
          eq(transactionsTable.id, id),
          eq(transactionsTable.status, TransactionStatus.PENDING)
        )
      )
      .returning({ id: transactionsTable.id });
    return rows.length > 0;
  };

  // Best-effort breadcrumb for ops: the row is SUCCESSFUL (money was taken)
  // but nothing was delivered. Status is deliberately left alone.
  const noteFulfilmentFailure = async (
    tx: ReconcilableTransaction,
    check: ProviderCheckResult,
    err: unknown
  ): Promise<void> => {
    try {
      await db
        .update(transactionsTable)
        .set({
          rawResponse: {
            ...check.providerData,
            reconciliation: {
              ...reconciliationNote('recovered'),
              fulfilment: 'failed',
              error: String(err),
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(transactionsTable.id, tx.id));
    } catch (noteErr) {
      log.error('Could not record fulfilment failure on transaction', {
        transactionId: tx.id,
        error: String(noteErr),
      });
    }
  };

  const resolveCheck = async (
    checker: ProviderChecker,
    tx: ReconcilableTransaction
  ): Promise<ProviderCheckResult | null> => {
    if (tx.providerTxId) {
      return normaliseCheck(await checker.check(tx.providerTxId, tx));
    }
    if (checker.findByMerchantReference) {
      return checker.findByMerchantReference(tx);
    }
    return null;
  };

  for (const tx of stale) {
    const checker = asChecker(providerChecks[tx.providerId]);
    // Without provider access nothing can be confirmed either way — leave the
    // row for a sweep that has credentials rather than guess.
    if (!checker) continue;

    try {
      const check = await resolveCheck(checker, tx);

      if (check?.status === 'successful') {
        const won = await settleIfStillPending(
          tx.id,
          TransactionStatus.SUCCESSFUL,
          {
            ...check.providerData,
            reconciliation: reconciliationNote('recovered'),
          },
          check.providerTxId
        );
        if (!won) continue;
        result.recovered++;

        if (!fulfil) {
          log.warn(
            'Reconciliation recovered a paid transaction without a webhook — no fulfil step configured',
            { transactionId: tx.id, providerId: tx.providerId }
          );
          continue;
        }
        try {
          await fulfil({ tx, check });
          log.info(
            'Reconciliation recovered and fulfilled a paid transaction',
            {
              transactionId: tx.id,
              providerId: tx.providerId,
            }
          );
        } catch (err) {
          result.fulfilmentFailed++;
          log.error(
            'Reconciliation recovered a paid transaction but fulfilment failed — manual fulfilment needed',
            {
              transactionId: tx.id,
              providerId: tx.providerId,
              error: String(err),
            }
          );
          await noteFulfilmentFailure(tx, check, err);
        }
        continue;
      }

      if (check?.status === 'failed') {
        if (
          await settleIfStillPending(tx.id, TransactionStatus.FAILED, {
            ...check.providerData,
            reconciliation: reconciliationNote('failed'),
          })
        ) {
          result.failed++;
        }
        continue;
      }

      // `unknown` = no answer from the provider; never age that into failure.
      if (check?.status === 'unknown') continue;

      // Explicit `pending`, or no provider record at all (null): abandon once
      // the row is old enough that the charge has surely resolved.
      if (tx.createdAt >= abandonCutoff) continue;
      const reason = check
        ? 'provider still reports pending after the abandon window'
        : tx.providerTxId
          ? 'provider has no record of this transaction'
          : checker.findByMerchantReference
            ? 'no provider transaction id and no provider record by merchant reference'
            : 'no provider transaction id was ever recorded';
      if (
        await settleIfStillPending(tx.id, TransactionStatus.FAILED, {
          reconciliation: reconciliationNote('abandoned', reason),
        })
      ) {
        result.abandoned++;
        log.info('Reconciliation abandoned a stale pending transaction', {
          transactionId: tx.id,
          providerId: tx.providerId,
          reason,
        });
      }
    } catch (err) {
      log.error('Reconciliation check failed', {
        transactionId: tx.id,
        providerId: tx.providerId,
        error: String(err),
      });
    }
  }

  return result;
}

// ─── Fulfilment of recovered payments ───────────────────────────────────────

/**
 * Idempotency key for the synthesised event. Deliberately NOT the provider's
 * event id: a real webhook that arrives later is still judged by its own id,
 * and the status CAS (not this key) is what stops double fulfilment.
 */
export function reconciliationEventId(transactionId: string): string {
  return `reconcile:${transactionId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checkout metadata as the provider would echo it back: the flat
 * `rawRequest` written at checkout (or its nested `metadata`, when the
 * checkout stored the whole params object), stringified like Stripe does.
 */
function readCheckoutMetadata(rawRequest: unknown): Record<string, string> {
  if (!isRecord(rawRequest)) return {};
  const source = isRecord(rawRequest.metadata)
    ? rawRequest.metadata
    : rawRequest;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') out[key] = value;
    else if (typeof value === 'number' || typeof value === 'boolean')
      out[key] = String(value);
  }
  return out;
}

/**
 * Rebuild the event the provider webhook would have delivered, from the row
 * and the provider's current view of the payment. One-time purchases (a
 * registered `metadata.type`) become `payment.completed`; plan rows become
 * `subscription.activated` the way a NOWPayments `finished` IPN does.
 */
export function buildRecoveredPaymentEvent({
  tx,
  check,
}: RecoveredTransaction): WebhookEvent {
  const metadata = readCheckoutMetadata(tx.rawRequest);
  const oneTime = getPaymentWebhookHandler(metadata.type) !== undefined;
  const type: WebhookEvent['type'] =
    oneTime || !tx.planId ? 'payment.completed' : 'subscription.activated';

  const now = new Date();
  const periodDays = tx.interval === 'yearly' ? 365 : 30;
  const subscriptionFields: Partial<
    Pick<WebhookEvent, 'status' | 'periodStart' | 'periodEnd'>
  > =
    type === 'subscription.activated'
      ? {
          status: 'active',
          periodStart: now,
          periodEnd: new Date(now.getTime() + periodDays * DAY_MS),
        }
      : {};

  return {
    type,
    organizationId: tx.organizationId,
    planId: tx.planId ?? undefined,
    ...subscriptionFields,
    ...check.event,
    providerData: {
      ...check.providerData,
      ...(isRecord(tx.rawRequest) ? tx.rawRequest : {}),
      metadata,
      transactionId: tx.id,
      userId: tx.userId ?? metadata.userId,
      amountCents: tx.amountCents,
      currency: tx.currency,
      _eventId: reconciliationEventId(tx.id),
      _reconciled: true,
    },
  };
}

export interface FulfilRecoveredPaymentDeps {
  db: DrizzleDB;
  eventsTable: EventsTable;
  /** Defaults to `dispatchPaymentEvent`; injectable for tests. */
  dispatch?: typeof dispatchPaymentEvent;
}

/**
 * Fulfil a payment the sweep just moved to SUCCESSFUL, exactly as the webhook
 * route would: claim an idempotency row, dispatch, and release the claim on
 * failure so a manual replay is not deduped away. Throws on dispatch failure
 * — the caller counts and surfaces it.
 */
export async function fulfilRecoveredPayment(
  recovered: RecoveredTransaction,
  {
    db,
    eventsTable,
    dispatch = dispatchPaymentEvent,
  }: FulfilRecoveredPaymentDeps
): Promise<void> {
  const { tx } = recovered;
  const event = buildRecoveredPaymentEvent(recovered);
  const eventId = reconciliationEventId(tx.id);

  try {
    await db.insert(eventsTable).values({
      providerId: tx.providerId,
      providerEventId: eventId,
      type: event.type,
      data: event.providerData,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      log.warn(
        'Recovered payment already claimed by an earlier reconciliation — not dispatching again',
        {
          transactionId: tx.id,
        }
      );
      return;
    }
    throw err;
  }

  try {
    await dispatch({ event, providerId: tx.providerId, eventId });
  } catch (err) {
    try {
      await db
        .delete(eventsTable)
        .where(
          and(
            eq(eventsTable.providerId, tx.providerId),
            eq(eventsTable.providerEventId, eventId)
          )
        );
    } catch (releaseErr) {
      log.error(
        'Failed to release reconciliation idempotency claim — replay manually',
        {
          transactionId: tx.id,
          eventId,
          error: String(releaseErr),
        }
      );
    }
    throw err;
  }
}
