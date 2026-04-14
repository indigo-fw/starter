/**
 * Transaction service — abstracts all saasPaymentTransactions access.
 *
 * Sibling modules (subscriptions, affiliates, crypto) should use these
 * functions instead of importing the schema directly. This keeps the
 * table structure as an internal detail of core-payments.
 */

import { eq, and, desc, sql, gte, lte, inArray } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasPaymentTransactions } from '@/core-payments/schema/payments';
import { organization } from '@/server/db/schema/organization';
import { TransactionStatus } from '@/core-payments/types/payment';
import { createLogger } from '@/core/lib/infra/logger';
import {
  reconcileStalePendingTransactions,
  type ProviderCheckFn,
} from '@/core-payments/lib/reconciliation-service';

const log = createLogger('transaction-service');

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
export async function insertRawTransaction(values: RawTransactionValues): Promise<void> {
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

export async function createTransaction(params: CreateTransactionParams): Promise<string> {
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
  rawResponse: Record<string, unknown>,
): Promise<void> {
  await db
    .update(saasPaymentTransactions)
    .set({ providerTxId, rawResponse, updatedAt: new Date() })
    .where(eq(saasPaymentTransactions.id, id));
}

export async function updateTransactionStatus(
  id: string,
  status: TransactionStatus,
  rawResponse?: Record<string, unknown>,
): Promise<void> {
  await db
    .update(saasPaymentTransactions)
    .set({
      status,
      ...(rawResponse && { rawResponse }),
      updatedAt: new Date(),
    })
    .where(eq(saasPaymentTransactions.id, id));
}

export async function getTransaction(id: string): Promise<TransactionRow | null> {
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
      total: sql<number>`coalesce(sum(${saasPaymentTransactions.amountCents}), 0)`.as('total'),
    })
    .from(saasPaymentTransactions)
    .where(eq(saasPaymentTransactions.status, status));

  return Number(result?.total ?? 0);
}

export async function getRecentTransactionsWithOrg(limit: number): Promise<RecentTransactionRow[]> {
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
    .leftJoin(organization, eq(saasPaymentTransactions.organizationId, organization.id))
    .orderBy(desc(saasPaymentTransactions.createdAt))
    .limit(limit);

  return rows;
}

export async function getRevenueOverTime(
  from?: string,
  to?: string,
): Promise<Array<{ date: string; revenue: number; count: number }>> {
  const conditions = [eq(saasPaymentTransactions.status, 'successful')];
  if (from) conditions.push(gte(saasPaymentTransactions.createdAt, new Date(from)));
  if (to) conditions.push(lte(saasPaymentTransactions.createdAt, new Date(to)));

  const rows = await db
    .select({
      date: sql<string>`to_char(${saasPaymentTransactions.createdAt}, 'YYYY-MM-DD')`.as('date'),
      revenue: sql<number>`sum(${saasPaymentTransactions.amountCents})`.as('revenue'),
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
  userIds: string[],
): Promise<Map<string, { totalRevenueCents: number }>> {
  if (userIds.length === 0) return new Map();

  const rows = await db
    .select({
      userId: saasPaymentTransactions.userId,
      total: sql<number>`coalesce(sum(${saasPaymentTransactions.amountCents}), 0)`.as('total'),
    })
    .from(saasPaymentTransactions)
    .where(
      and(
        inArray(saasPaymentTransactions.userId, userIds),
        eq(saasPaymentTransactions.status, 'successful'),
      ),
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
  capturedAmountCents: number,
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

/** 10-second timeout for provider API calls */
const PROVIDER_TIMEOUT_MS = 10_000;

async function checkStripeTransaction(
  providerTxId: string,
): Promise<'successful' | 'pending' | 'failed'> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return 'pending';

  const isCheckout = providerTxId.startsWith('cs_');
  const url = isCheckout
    ? `https://api.stripe.com/v1/checkout/sessions/${providerTxId}`
    : `https://api.stripe.com/v1/subscriptions/${providerTxId}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${stripeKey}` },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (res.status === 429 || res.status === 401) return 'pending';
  if (res.status === 404) return 'failed';
  if (!res.ok) return 'pending';

  const data = (await res.json()) as Record<string, unknown>;

  if (isCheckout) {
    const status = data.payment_status as string;
    if (status === 'paid') return 'successful';
    if (status === 'unpaid' || status === 'no_payment_required') return 'pending';
    return 'failed';
  }

  const subStatus = data.status as string;
  if (subStatus === 'active' || subStatus === 'trialing') return 'successful';
  if (subStatus === 'past_due' || subStatus === 'incomplete') return 'pending';
  return 'failed';
}

async function checkNowPaymentsTransaction(
  providerTxId: string,
): Promise<'successful' | 'pending' | 'failed'> {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) return 'pending';

  const isSandbox = process.env.NOWPAYMENTS_SANDBOX !== 'false';
  const baseUrl = isSandbox
    ? 'https://api-sandbox.nowpayments.io/v1'
    : 'https://api.nowpayments.io/v1';

  const res = await fetch(`${baseUrl}/payment/${providerTxId}`, {
    headers: { 'x-api-key': apiKey },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (res.status === 429 || res.status === 401 || res.status === 403) return 'pending';
  if (res.status === 404) return 'failed';
  if (!res.ok) return 'pending';

  const data = (await res.json()) as Record<string, unknown>;
  const status = data.payment_status as string;

  if (status === 'finished' || status === 'confirmed') return 'successful';
  if (status === 'waiting' || status === 'confirming' || status === 'sending') return 'pending';
  return 'failed';
}

/**
 * Reconcile stale pending payment transactions by checking with providers.
 * Moved here from dunning.ts since it operates on the payments table.
 */
export async function runReconciliation(): Promise<void> {
  const providerChecks: Record<string, ProviderCheckFn> = {};

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
    { staleThresholdHours: 24 },
  );

  if (result.checked > 0) {
    log.info('Reconciliation results', result);
  }
}
