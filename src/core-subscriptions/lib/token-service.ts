import { eq, sql, and, asc, desc, gt, lte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { db } from '@/server/db';
import { saasTokenBalances, saasTokenLots, saasTokenTransactions } from '@/core-subscriptions/schema/subscriptions';
import { getBillingConfig } from '@/core-subscriptions/lib/billing-config';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('token-service');

import { getSubscriptionsDeps } from '@/core-subscriptions/deps';

/**
 * Balances have two buckets:
 * - 'purchased' (`balance` column) — permanent: packs, bonuses, refunds, admin credits
 * - 'plan' (`planBalance` column)  — subscription allowance: monthly grants top it
 *   up and `resetBalanceOnGrant` may expire it
 * Deductions spend the plan bucket first by default (expiring tokens are
 * consumed before permanent ones); refund clawbacks use 'purchased-first' to
 * take back the bucket that was credited. All public totals are plan + purchased.
 *
 * When `BillingConfig.planTokenValidityMonths` is set, plan grants carry an
 * expiry and are tracked as lots (`saas_token_lots`); deductions drain lots
 * soonest-expiry-first and due lots are expired lazily on spend plus by the
 * daily cron sweep. `planBalance` remains the materialized plan-bucket total.
 *
 * Concurrency: every mutation locks the org's balance row (SELECT FOR UPDATE)
 * first, so concurrent spends/grants/expiries serialize per org. Lock order is
 * always balance row → lots, which prevents deadlocks.
 */
export type TokenBucket = 'plan' | 'purchased';

/** db or a drizzle transaction — lets callers compose token ops into their own tx. */
export type TokenDbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface TokenOpOptions {
  /** Target bucket for credits. Default 'purchased' (permanent). */
  bucket?: TokenBucket;
  /** Expiry for plan-bucket credits — creates a grant lot. Ignored for 'purchased'. */
  expiresAt?: Date;
  /**
   * Bucket drain order for debits. Default 'plan-first' (spend expiring
   * tokens before permanent ones). Refund clawbacks use 'purchased-first'
   * so the bucket that was credited is the one taken back.
   */
  spendOrder?: 'plan-first' | 'purchased-first';
  /**
   * Debit at most the available balance instead of throwing on insufficient
   * funds. Used for best-effort clawbacks.
   */
  clamp?: boolean;
  /** Run inside an existing transaction (nested as a savepoint). */
  tx?: TokenDbClient;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Safety cap on lot rows touched per operation (≈ decades of monthly grants). */
const LOT_QUERY_LIMIT = 500;

// ─── WS broadcast via injected deps ────────────────────────────────────────

/**
 * Broadcast a token balance update to the org's WebSocket channel.
 * Exported for callers that compose token ops into their own transaction
 * (`opts.tx`) — they must broadcast AFTER their commit, since the ops
 * themselves skip broadcasting in that case.
 */
export function broadcastTokenBalance(orgId: string, balance: number): void {
  try {
    getSubscriptionsDeps().broadcastEvent(`org:${orgId}`, 'token_balance_update', { balance, orgId, timestamp: new Date().toISOString() });
  } catch {
    // deps not ready or broadcast failed — fire-and-forget
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function insufficientTokens(have: number, need: number): TRPCError {
  return new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: `Insufficient tokens: have ${have}, need ${need}`,
  });
}

/** Lock the org's balance row for the duration of the transaction. */
async function lockBalanceRow(tx: Tx, orgId: string) {
  const [row] = await tx
    .select({ balance: saasTokenBalances.balance, planBalance: saasTokenBalances.planBalance })
    .from(saasTokenBalances)
    .where(eq(saasTokenBalances.organizationId, orgId))
    .limit(1)
    .for('update');
  return row ?? null;
}

/** Sum of unexpired lot remainders for an org (0 when the feature is unused). */
async function liveLotTotal(tx: Tx, orgId: string): Promise<number> {
  const [row] = await tx
    .select({ total: sql<number>`COALESCE(SUM(${saasTokenLots.remaining}), 0)` })
    .from(saasTokenLots)
    .where(
      and(
        eq(saasTokenLots.organizationId, orgId),
        gt(saasTokenLots.remaining, 0),
        gt(saasTokenLots.expiresAt, new Date()),
      )
    );
  return Number(row?.total ?? 0);
}

/**
 * Expire due lots for one org — must run while holding the balance row lock.
 * Zeroes all due lots in one UPDATE, decrements planBalance, and writes one
 * aggregate 'expiry' ledger entry. Returns the expired amount and the new
 * total balance.
 */
async function expireDueLotsLocked(tx: Tx, orgId: string, planBalance: number): Promise<{ expired: number; total: number | null }> {
  const duePredicate = and(
    eq(saasTokenLots.organizationId, orgId),
    gt(saasTokenLots.remaining, 0),
    lte(saasTokenLots.expiresAt, new Date()),
  );

  const [due] = await tx
    .select({ total: sql<number>`COALESCE(SUM(${saasTokenLots.remaining}), 0)`, count: sql<number>`COUNT(*)` })
    .from(saasTokenLots)
    .where(duePredicate);

  const dueTotal = Number(due?.total ?? 0);
  if (dueTotal === 0) return { expired: 0, total: null };

  // Clamp against drift — never push planBalance negative
  const expired = Math.min(dueTotal, planBalance);

  await tx.update(saasTokenLots).set({ remaining: 0 }).where(duePredicate);

  const [updated] = await tx
    .update(saasTokenBalances)
    .set({
      planBalance: sql`GREATEST(${saasTokenBalances.planBalance} - ${expired}, 0)`,
      updatedAt: new Date(),
    })
    .where(eq(saasTokenBalances.organizationId, orgId))
    .returning({ balance: saasTokenBalances.balance, planBalance: saasTokenBalances.planBalance });

  const total = (updated?.balance ?? 0) + (updated?.planBalance ?? 0);

  if (expired > 0) {
    await tx.insert(saasTokenTransactions).values({
      organizationId: orgId,
      amount: -expired,
      balanceAfter: total,
      reason: 'expiry',
      metadata: { lots: Number(due?.count ?? 0) },
    });
    logger.info('Plan token lots expired', { orgId, expired });
  }

  return { expired, total };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the total spendable token balance (plan + purchased) for an
 * organization. Returns 0 if no balance record exists. May briefly include
 * lots that are past expiry but not yet swept (lazy expiry runs on spend and
 * in the daily cron).
 */
export async function getTokenBalance(orgId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`${saasTokenBalances.balance} + ${saasTokenBalances.planBalance}` })
    .from(saasTokenBalances)
    .where(eq(saasTokenBalances.organizationId, orgId))
    .limit(1);
  return Number(row?.total ?? 0);
}

/**
 * Get full token balance record including both buckets and lifetime stats.
 */
export async function getTokenBalanceRecord(orgId: string) {
  const [row] = await db
    .select()
    .from(saasTokenBalances)
    .where(eq(saasTokenBalances.organizationId, orgId))
    .limit(1);
  return row ?? null;
}

/**
 * Add tokens (credit). Used for purchases, bonuses, refunds, and — with
 * `bucket: 'plan'` — subscription grants. Pass `expiresAt` on plan credits
 * to create a per-grant expiry lot. Returns the new total balance.
 *
 * With `opts.tx` the credit joins the caller's transaction and NO balance
 * broadcast is sent — call `broadcastTokenBalance()` after your commit.
 */
export async function addTokens(
  orgId: string,
  amount: number,
  reason: string,
  metadata?: Record<string, unknown>,
  opts?: TokenOpOptions,
): Promise<number> {
  if (amount <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'addTokens amount must be positive' });
  const bucket: TokenBucket = opts?.bucket ?? 'purchased';
  const expiresAt = bucket === 'plan' ? opts?.expiresAt : undefined;
  const client = opts?.tx ?? db;

  const newBalance = await client.transaction(async (tx) => {
    // Upsert the target bucket
    const [row] = await tx
      .insert(saasTokenBalances)
      .values({
        organizationId: orgId,
        balance: bucket === 'purchased' ? amount : 0,
        planBalance: bucket === 'plan' ? amount : 0,
        lifetimeAdded: amount,
      })
      .onConflictDoUpdate({
        target: saasTokenBalances.organizationId,
        set: {
          ...(bucket === 'plan'
            ? { planBalance: sql`${saasTokenBalances.planBalance} + ${amount}` }
            : { balance: sql`${saasTokenBalances.balance} + ${amount}` }),
          lifetimeAdded: sql`${saasTokenBalances.lifetimeAdded} + ${amount}`,
          updatedAt: new Date(),
        },
      })
      .returning({ balance: saasTokenBalances.balance, planBalance: saasTokenBalances.planBalance });

    if (expiresAt) {
      await tx.insert(saasTokenLots).values({
        organizationId: orgId,
        initialAmount: amount,
        remaining: amount,
        expiresAt,
        metadata: metadata ?? null,
      });
    }

    const total = row!.balance + row!.planBalance;

    // Ledger entry
    await tx.insert(saasTokenTransactions).values({
      organizationId: orgId,
      amount,
      balanceAfter: total,
      reason,
      metadata: { ...metadata, bucket, ...(expiresAt && { expiresAt: expiresAt.toISOString() }) },
    });

    return total;
  });

  logger.info('Tokens added', { orgId, amount, reason, bucket, newBalance });
  if (!opts?.tx) broadcastTokenBalance(orgId, newBalance);
  return newBalance;
}

/**
 * Deduct tokens (debit). Used for feature usage, API calls, refund clawbacks.
 * Default drain order: plan bucket first — grant lots soonest-expiry-first,
 * then legacy (lot-less) plan tokens — then the purchased bucket. Due lots
 * are lazily expired before the balance check. Returns the new total
 * balance; throws on insufficient funds unless `opts.clamp` is set.
 *
 * Race-safe: the org's balance row is locked (SELECT FOR UPDATE) for the
 * whole operation, so concurrent spends serialize. The ledger entry records
 * the per-bucket split (`planUsed` / `purchasedUsed`).
 *
 * With `opts.tx` the debit joins the caller's transaction and NO balance
 * broadcast is sent — call `broadcastTokenBalance()` after your commit.
 */
export async function deductTokens(
  orgId: string,
  amount: number,
  reason: string,
  metadata?: Record<string, unknown>,
  opts?: Pick<TokenOpOptions, 'tx' | 'spendOrder' | 'clamp'>,
): Promise<number> {
  if (amount <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'deductTokens amount must be positive' });
  const client = opts?.tx ?? db;
  const lotsEnabled = (getBillingConfig().planTokenValidityMonths ?? 0) > 0;

  // Persist expiry of overdue lots in its own transaction first — otherwise
  // an insufficient-funds rollback would revert the expiry and the stale
  // balance would keep reappearing. Cheap indexed probe, only sweeps on hit.
  // Skipped on the hot path when the lots feature is off, and when composed
  // into a caller's tx (the in-tx expiry below covers correctness either way).
  if (!opts?.tx && lotsEnabled) {
    const [due] = await db
      .select({ id: saasTokenLots.id })
      .from(saasTokenLots)
      .where(
        and(
          eq(saasTokenLots.organizationId, orgId),
          gt(saasTokenLots.remaining, 0),
          lte(saasTokenLots.expiresAt, new Date()),
        )
      )
      .limit(1);
    if (due) await expireDueTokenLots(orgId);
  }

  const newBalance = await client.transaction(async (tx) => {
    const row = await lockBalanceRow(tx, orgId);
    if (!row) {
      if (opts?.clamp) return null;
      throw insufficientTokens(0, amount);
    }

    const { balance } = row;
    let { planBalance } = row;

    // Belt-and-braces: expire anything that slipped past the up-front sweep
    // (composed-tx callers, or a lot expiring in the race window)
    if (lotsEnabled && planBalance > 0) {
      planBalance -= (await expireDueLotsLocked(tx, orgId, planBalance)).expired;
    }

    const available = balance + planBalance;
    const toDeduct = opts?.clamp ? Math.min(amount, available) : amount;
    if (toDeduct > available) throw insufficientTokens(available, amount);
    if (toDeduct === 0) return available;

    // Split the debit across buckets according to the drain order
    let purchasedUsed = opts?.spendOrder === 'purchased-first' ? Math.min(balance, toDeduct) : 0;
    const planTarget = Math.min(planBalance, toDeduct - purchasedUsed);

    // Drain the plan share: grant lots soonest-expiry-first…
    let lotsUsed = 0;
    let legacyUse = 0;
    if (planTarget > 0) {
      const lotTotal = await liveLotTotal(tx, orgId);
      if (lotTotal > 0) {
        const lots = await tx
          .select({ id: saasTokenLots.id, remaining: saasTokenLots.remaining })
          .from(saasTokenLots)
          .where(
            and(
              eq(saasTokenLots.organizationId, orgId),
              gt(saasTokenLots.remaining, 0),
              gt(saasTokenLots.expiresAt, new Date()),
            )
          )
          .orderBy(asc(saasTokenLots.expiresAt), asc(saasTokenLots.createdAt))
          .limit(LOT_QUERY_LIMIT)
          .for('update');

        for (const lot of lots) {
          if (lotsUsed >= planTarget) break;
          const use = Math.min(lot.remaining, planTarget - lotsUsed);
          await tx.update(saasTokenLots).set({ remaining: lot.remaining - use }).where(eq(saasTokenLots.id, lot.id));
          lotsUsed += use;
        }
      }

      // …then legacy (lot-less) plan tokens. The SUM-based bound guarantees
      // legacy spend never eats tokens still held inside lots, even if the
      // drain above was row-capped.
      const legacyAvailable = Math.max(planBalance - lotTotal, 0);
      legacyUse = Math.min(legacyAvailable, planTarget - lotsUsed);
    }
    const planUsed = lotsUsed + legacyUse;

    // Whatever the plan bucket could not serve comes from purchased
    purchasedUsed = toDeduct - planUsed;
    if (purchasedUsed > balance) {
      // Only reachable when >LOT_QUERY_LIMIT lots hold the org's plan tokens
      logger.error('Token deduction exceeded drainable buckets', { orgId, amount: toDeduct, planUsed, balance });
      throw insufficientTokens(balance + planUsed, amount);
    }

    const [updated] = await tx
      .update(saasTokenBalances)
      .set({
        planBalance: planBalance - planUsed,
        balance: balance - purchasedUsed,
        lifetimeUsed: sql`${saasTokenBalances.lifetimeUsed} + ${toDeduct}`,
        updatedAt: new Date(),
      })
      .where(eq(saasTokenBalances.organizationId, orgId))
      .returning({ balance: saasTokenBalances.balance, planBalance: saasTokenBalances.planBalance });

    const total = updated!.balance + updated!.planBalance;

    // Ledger entry with the bucket split
    await tx.insert(saasTokenTransactions).values({
      organizationId: orgId,
      amount: -toDeduct,
      balanceAfter: total,
      reason,
      metadata: { ...metadata, planUsed, purchasedUsed },
    });

    return total;
  });

  if (newBalance === null) return 0; // clamp on a missing balance row

  logger.info('Tokens deducted', { orgId, amount, reason, newBalance });
  if (!opts?.tx) broadcastTokenBalance(orgId, newBalance);
  return newBalance;
}

/**
 * Expire the plan (subscription-grant) bucket: zero it — including any grant
 * lots — and record the expiry in the ledger. Purchased tokens are untouched.
 * Returns the expired amount. Used by `resetBalanceOnGrant` before each new
 * monthly grant.
 */
export async function expirePlanTokens(
  orgId: string,
  metadata?: Record<string, unknown>,
  opts?: Pick<TokenOpOptions, 'tx'>,
): Promise<number> {
  const client = opts?.tx ?? db;

  const expired = await client.transaction(async (tx) => {
    const row = await lockBalanceRow(tx, orgId);
    if (!row || row.planBalance <= 0) return 0;

    await tx
      .update(saasTokenLots)
      .set({ remaining: 0 })
      .where(and(eq(saasTokenLots.organizationId, orgId), gt(saasTokenLots.remaining, 0)));

    await tx
      .update(saasTokenBalances)
      .set({ planBalance: 0, updatedAt: new Date() })
      .where(eq(saasTokenBalances.organizationId, orgId));

    await tx.insert(saasTokenTransactions).values({
      organizationId: orgId,
      amount: -row.planBalance,
      balanceAfter: row.balance,
      reason: 'expiry',
      metadata: metadata ?? null,
    });

    return row.planBalance;
  });

  if (expired > 0) logger.info('Plan tokens expired', { orgId, expired });
  return expired;
}

/**
 * Expire any due grant lots for one org (lock, zero, ledger). Safe to call
 * for orgs with no lots; also clears drifted lots whose tokens were already
 * spent. Returns the expired amount. The daily cron uses this;
 * `deductTokens` applies the same logic lazily on spend.
 */
export async function expireDueTokenLots(orgId: string): Promise<number> {
  const result = await db.transaction(async (tx) => {
    const row = await lockBalanceRow(tx, orgId);
    if (!row) return { expired: 0, total: null };
    return expireDueLotsLocked(tx, orgId, row.planBalance);
  });

  if (result.expired > 0 && result.total !== null) {
    broadcastTokenBalance(orgId, result.total);
  }
  return result.expired;
}

/**
 * Org IDs holding lots that are past expiry but not yet zeroed — the daily
 * cron's work list.
 */
export async function findOrgsWithDueLots(limit = 500): Promise<string[]> {
  const rows = await db
    .selectDistinct({ organizationId: saasTokenLots.organizationId })
    .from(saasTokenLots)
    .where(and(gt(saasTokenLots.remaining, 0), lte(saasTokenLots.expiresAt, new Date())))
    .limit(limit);
  return rows.map((r) => r.organizationId);
}

/**
 * Get recent token transactions for an organization.
 */
export async function getTokenTransactions(orgId: string, limit = 20) {
  return db
    .select()
    .from(saasTokenTransactions)
    .where(eq(saasTokenTransactions.organizationId, orgId))
    .orderBy(desc(saasTokenTransactions.createdAt))
    .limit(limit);
}
