/**
 * Transaction service — abstracts all saasPaymentTransactions access.
 *
 * Sibling modules (subscriptions, affiliates, crypto) should use these
 * functions instead of importing the schema directly. This keeps the
 * table structure as an internal detail of core-payments.
 */
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';

import {
  type ProviderCheck,
  type ProviderCheckFn,
  type ProviderCheckResult,
  type ProviderCheckStatus,
  fulfilRecoveredPayment,
  reconcileStalePendingTransactions,
} from '@/core-payments/lib/reconciliation-service';
import {
  saasPaymentTransactions,
  saasSubscriptionEvents,
} from '@/core-payments/schema/payments';
import { TransactionStatus } from '@/core-payments/types/payment';
import { createLogger } from '@/core/lib/infra/logger';
import { db } from '@/server/db';
import { organization } from '@/server/db/schema/organization';

const log = createLogger('transaction-service');

/**
 * Resolve the NOWPayments API base URL. Sandbox is opt-in — a bare production
 * deploy that only sets NOWPAYMENTS_API_KEY must invoice against live, so we
 * require the explicit string 'true' rather than defaulting to sandbox.
 */
export function getNowPaymentsApiBase(): string {
  const sandbox = process.env.NOWPAYMENTS_SANDBOX === 'true';
  return sandbox
    ? 'https://api-sandbox.nowpayments.io'
    : 'https://api.nowpayments.io';
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreateTransactionParams {
  organizationId: string;
  providerId: string;
  amountCents: number;
  currency?: string;
  status?: TransactionStatus;
  planId: string;
  interval: 'monthly' | 'yearly';
  discountCodeId?: string | null;
  discountAmountCents?: number;
  metadata?: Record<string, unknown> | null;
}

export interface TransactionRow {
  id: string;
  organizationId: string;
  providerId: string;
  providerTxId: string | null;
  amountCents: number;
  currency: string;
  status: string;
  planId: string | null;
  interval: string | null;
  discountCodeId: string | null;
  discountAmountCents: number;
  rawRequest: unknown;
  rawResponse: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecentTransactionRow {
  id: string;
  organizationId: string;
  orgName: string | null;
  providerId: string;
  amountCents: number;
  currency: string;
  status: string;
  planId: string | null;
  interval: string | null;
  createdAt: Date;
}

// ─── Raw insert (for seeds / migrations) ───────────────────────────────────

export interface RawTransactionValues {
  id?: string;
  organizationId: string;
  userId?: string | null;
  providerId: string;
  providerTxId?: string | null;
  amountCents: number;
  currency?: string;
  status?: string;
  planId?: string | null;
  interval?: string | null;
  discountCodeId?: string | null;
  discountAmountCents?: number;
  rawRequest?: unknown;
  rawResponse?: unknown;
  transactionType?: 'payment' | 'authorization' | 'capture' | 'refund' | 'void';
  paymentIntentId?: string | null;
  paymentMethodId?: string | null;
  authorizedAmountCents?: number | null;
  capturedAmountCents?: number | null;
  authorizationExpiresAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Insert a transaction with explicit values (including id/timestamps).
 * Used by seeds and migrations — sibling modules should use this instead
 * of importing saasPaymentTransactions schema directly.
 */
export async function insertRawTransaction(
  values: RawTransactionValues
): Promise<void> {
  await db.insert(saasPaymentTransactions).values({
    id: values.id,
    organizationId: values.organizationId,
    userId: values.userId ?? null,
    providerId: values.providerId,
    providerTxId: values.providerTxId ?? null,
    amountCents: values.amountCents,
    currency: values.currency ?? 'usd',
    status: values.status ?? 'pending',
    planId: values.planId ?? null,
    interval: values.interval ?? null,
    discountCodeId: values.discountCodeId ?? null,
    discountAmountCents: values.discountAmountCents ?? 0,
    rawRequest: values.rawRequest ?? null,
    rawResponse: values.rawResponse ?? null,
    transactionType: values.transactionType ?? 'payment',
    paymentIntentId: values.paymentIntentId ?? null,
    paymentMethodId: values.paymentMethodId ?? null,
    authorizedAmountCents: values.authorizedAmountCents ?? null,
    capturedAmountCents: values.capturedAmountCents ?? null,
    authorizationExpiresAt: values.authorizationExpiresAt ?? null,
    createdAt: values.createdAt,
    updatedAt: values.updatedAt,
  });
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function createTransaction(
  params: CreateTransactionParams
): Promise<string> {
  const [tx] = await db
    .insert(saasPaymentTransactions)
    .values({
      organizationId: params.organizationId,
      providerId: params.providerId,
      amountCents: params.amountCents,
      currency: params.currency ?? 'usd',
      status: params.status ?? TransactionStatus.PENDING,
      planId: params.planId,
      interval: params.interval,
      discountCodeId: params.discountCodeId ?? null,
      discountAmountCents: params.discountAmountCents ?? 0,
      rawRequest: params.metadata ?? null,
    })
    .returning({ id: saasPaymentTransactions.id });

  return tx!.id;
}

export async function updateTransactionProvider(
  id: string,
  providerTxId: string,
  rawResponse: Record<string, unknown>
): Promise<void> {
  await db
    .update(saasPaymentTransactions)
    .set({ providerTxId, rawResponse, updatedAt: new Date() })
    .where(eq(saasPaymentTransactions.id, id));
}

/**
 * Set a transaction's status, optionally as a compare-and-set.
 *
 * Provider webhooks arrive out of order and get redelivered, so a status
 * write that ignores the current row lets a late `failed` IPN flip a paid
 * transaction back to FAILED, or a second `finished` activate twice. Pass
 * `allowedFrom` to only transition from those statuses; the boolean tells the
 * caller whether *this* call won the transition (false = someone else already
 * moved the row, or it was in a state the transition doesn't apply to), so
 * fulfilment runs exactly once. Omitting `allowedFrom` keeps the plain
 * unconditional write (Stripe's handler relies on it).
 */
export async function updateTransactionStatus(
  id: string,
  status: TransactionStatus,
  rawResponse?: Record<string, unknown>,
  allowedFrom?: TransactionStatus[]
): Promise<boolean> {
  const conditions = [eq(saasPaymentTransactions.id, id)];
  if (allowedFrom && allowedFrom.length > 0) {
    conditions.push(inArray(saasPaymentTransactions.status, allowedFrom));
  }

  const updated = await db
    .update(saasPaymentTransactions)
    .set({
      status,
      ...(rawResponse && { rawResponse }),
      updatedAt: new Date(),
    })
    .where(and(...conditions))
    .returning({ id: saasPaymentTransactions.id });

  return updated.length > 0;
}

export async function getTransaction(
  id: string
): Promise<TransactionRow | null> {
  const [tx] = await db
    .select()
    .from(saasPaymentTransactions)
    .where(eq(saasPaymentTransactions.id, id))
    .limit(1);

  return (tx as TransactionRow | undefined) ?? null;
}

// ─── Queries (for billing admin stats) ──────────────────────────────────────

export async function getTransactionRevenue(status: string): Promise<number> {
  const [result] = await db
    .select({
      total:
        sql<number>`coalesce(sum(${saasPaymentTransactions.amountCents}), 0)`.as(
          'total'
        ),
    })
    .from(saasPaymentTransactions)
    .where(eq(saasPaymentTransactions.status, status));

  return Number(result?.total ?? 0);
}

export async function getRecentTransactionsWithOrg(
  limit: number
): Promise<RecentTransactionRow[]> {
  const rows = await db
    .select({
      id: saasPaymentTransactions.id,
      organizationId: saasPaymentTransactions.organizationId,
      orgName: organization.name,
      providerId: saasPaymentTransactions.providerId,
      amountCents: saasPaymentTransactions.amountCents,
      currency: saasPaymentTransactions.currency,
      status: saasPaymentTransactions.status,
      planId: saasPaymentTransactions.planId,
      interval: saasPaymentTransactions.interval,
      createdAt: saasPaymentTransactions.createdAt,
    })
    .from(saasPaymentTransactions)
    .leftJoin(
      organization,
      eq(saasPaymentTransactions.organizationId, organization.id)
    )
    .orderBy(desc(saasPaymentTransactions.createdAt))
    .limit(limit);

  return rows;
}

export async function getRevenueOverTime(
  from?: string,
  to?: string
): Promise<Array<{ date: string; revenue: number; count: number }>> {
  const conditions = [eq(saasPaymentTransactions.status, 'successful')];
  if (from)
    conditions.push(gte(saasPaymentTransactions.createdAt, new Date(from)));
  if (to) conditions.push(lte(saasPaymentTransactions.createdAt, new Date(to)));

  const rows = await db
    .select({
      date: sql<string>`to_char(${saasPaymentTransactions.createdAt}, 'YYYY-MM-DD')`.as(
        'date'
      ),
      revenue: sql<number>`sum(${saasPaymentTransactions.amountCents})`.as(
        'revenue'
      ),
      count: sql<number>`count(*)`.as('count'),
    })
    .from(saasPaymentTransactions)
    .where(and(...conditions))
    .groupBy(sql`to_char(${saasPaymentTransactions.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${saasPaymentTransactions.createdAt}, 'YYYY-MM-DD')`)
    .limit(365);

  return rows.map((r) => ({
    date: r.date,
    revenue: Number(r.revenue),
    count: Number(r.count),
  }));
}

// ─── Revenue by users (for affiliates) ──────────────────────────────────────

export async function getRevenueByUsers(
  userIds: string[]
): Promise<Map<string, { totalRevenueCents: number }>> {
  if (userIds.length === 0) return new Map();

  const rows = await db
    .select({
      userId: saasPaymentTransactions.userId,
      total:
        sql<number>`coalesce(sum(${saasPaymentTransactions.amountCents}), 0)`.as(
          'total'
        ),
    })
    .from(saasPaymentTransactions)
    .where(
      and(
        inArray(saasPaymentTransactions.userId, userIds),
        eq(saasPaymentTransactions.status, 'successful')
      )
    )
    .groupBy(saasPaymentTransactions.userId);

  const result = new Map<string, { totalRevenueCents: number }>();
  for (const row of rows) {
    if (row.userId) {
      result.set(row.userId, { totalRevenueCents: Number(row.total) });
    }
  }
  return result;
}

// ─── Auth / Capture / Void ──────────────────────────────────────────────────

export async function createAuthorizationTransaction(params: {
  organizationId: string;
  providerId: string;
  providerTxId: string;
  authorizedAmountCents: number;
  currency?: string;
  paymentMethodId?: string;
  paymentIntentId?: string;
  authorizationExpiresAt?: Date;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const [tx] = await db
    .insert(saasPaymentTransactions)
    .values({
      organizationId: params.organizationId,
      providerId: params.providerId,
      providerTxId: params.providerTxId,
      amountCents: params.authorizedAmountCents,
      authorizedAmountCents: params.authorizedAmountCents,
      currency: params.currency ?? 'usd',
      status: TransactionStatus.AUTHORIZED,
      transactionType: 'authorization',
      paymentIntentId: params.paymentIntentId ?? params.providerTxId,
      paymentMethodId: params.paymentMethodId ?? null,
      authorizationExpiresAt: params.authorizationExpiresAt ?? null,
      rawRequest: params.metadata ?? null,
    })
    .returning({ id: saasPaymentTransactions.id });

  return tx!.id;
}

export async function recordCapture(
  transactionId: string,
  capturedAmountCents: number
): Promise<void> {
  await db
    .update(saasPaymentTransactions)
    .set({
      status: TransactionStatus.CAPTURED,
      capturedAmountCents,
      transactionType: 'capture',
      updatedAt: new Date(),
    })
    .where(eq(saasPaymentTransactions.id, transactionId));
}

export async function recordVoid(transactionId: string): Promise<void> {
  await db
    .update(saasPaymentTransactions)
    .set({
      status: TransactionStatus.VOIDED,
      transactionType: 'void',
      updatedAt: new Date(),
    })
    .where(eq(saasPaymentTransactions.id, transactionId));
}

// ─── Reconciliation ─────────────────────────────────────────────────────────
// ─── Reconciliation ─────────────────────────────────────────────────────────

/** 10-second timeout for provider API calls */
const PROVIDER_TIMEOUT_MS = 10_000;

/**
 * Transport/auth problems are `unknown`, not `pending`: the sweep ages an
 * explicit `pending` into FAILED, and a Stripe outage must never do that.
 */
function statusForUnusableResponse(status: number): ProviderCheckStatus {
  if (status === 404) return 'failed';
  return 'unknown';
}

const checkStripeTransaction: ProviderCheckFn = async (providerTxId) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return 'unknown';

  const isCheckout = providerTxId.startsWith('cs_');
  const url = isCheckout
    ? `https://api.stripe.com/v1/checkout/sessions/${providerTxId}`
    : `https://api.stripe.com/v1/subscriptions/${providerTxId}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${stripeKey}` },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!res.ok) return statusForUnusableResponse(res.status);

  const data = (await res.json()) as Record<string, unknown>;
  // The webhook event carries these — give the subscription handler the same
  // handles on a recovered row.
  const event: ProviderCheckResult['event'] = {
    ...(typeof data.customer === 'string' && {
      providerCustomerId: data.customer,
    }),
    ...(typeof data.subscription === 'string' && {
      providerSubscriptionId: data.subscription,
    }),
    ...(!isCheckout && { providerSubscriptionId: providerTxId }),
  };

  let status: ProviderCheckStatus;
  if (isCheckout) {
    const paymentStatus = data.payment_status as string;
    status =
      paymentStatus === 'paid'
        ? 'successful'
        : paymentStatus === 'unpaid' || paymentStatus === 'no_payment_required'
          ? 'pending'
          : 'failed';
  } else {
    const subStatus = data.status as string;
    status =
      subStatus === 'active' || subStatus === 'trialing'
        ? 'successful'
        : subStatus === 'past_due' || subStatus === 'incomplete'
          ? 'pending'
          : 'failed';
  }

  return { status, providerData: data, event };
};

const checkNowPaymentsTransaction: ProviderCheckFn = async (
  providerTxId,
  tx
) => {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) return 'unknown';

  const baseUrl = `${getNowPaymentsApiBase()}/v1`;

  const res = await fetch(`${baseUrl}/payment/${providerTxId}`, {
    headers: { 'x-api-key': apiKey },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!res.ok) return statusForUnusableResponse(res.status);

  const data = (await res.json()) as Record<string, unknown>;
  const status = data.payment_status as string;

  // Only `finished` means the full amount settled — `confirmed` can still be
  // partial, which is why the IPN handler refuses to activate on it too. Now
  // that recovery fulfils, the sweep must draw the same line.
  if (status === 'finished') {
    return {
      status: 'successful',
      providerData: data,
      // Same synthetic customer handle the NOWPayments `finished` IPN emits,
      // so the subscription row looks identical whichever path activated it.
      event: { providerCustomerId: `np_org_${tx.organizationId}` },
    };
  }
  if (
    status === 'waiting' ||
    status === 'confirming' ||
    status === 'confirmed' ||
    status === 'sending'
  ) {
    return { status: 'pending', providerData: data };
  }
  return { status: 'failed', providerData: data };
};

/**
 * Reconcile stale pending payment transactions by checking with providers,
 * fulfilling anything the provider confirms as paid through the same dispatch
 * the webhook routes use. Called from the daily dunning job via
 * `SubscriptionsDeps.runReconciliation`.
 */
export async function runReconciliation(): Promise<void> {
  const providerChecks: Record<string, ProviderCheck> = {};

  if (process.env.STRIPE_SECRET_KEY) {
    providerChecks['stripe'] = checkStripeTransaction;
  }
  if (process.env.NOWPAYMENTS_API_KEY) {
    providerChecks['nowpayments'] = checkNowPaymentsTransaction;
  }

  if (Object.keys(providerChecks).length === 0) {
    return;
  }

  const result = await reconcileStalePendingTransactions(
    db,
    saasPaymentTransactions,
    providerChecks,
    {
      staleThresholdHours: 24,
      abandonAfterHours: 24,
      fulfil: (recovered) =>
        fulfilRecoveredPayment(recovered, {
          db,
          eventsTable: saasSubscriptionEvents,
        }),
    }
  );

  if (result.fulfilmentFailed > 0) {
    log.error(
      'Reconciliation recovered paid transactions it could not fulfil — see per-row errors above',
      result
    );
  } else if (result.checked > 0) {
    log.info('Reconciliation results', result);
  }
}
