import { eq, sql, and, gte, desc } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasTokenBalances, saasTokenTransactions } from '@/core-subscriptions/schema/subscriptions';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('token-service');

import { getSubscriptionsDeps } from '@/core-subscriptions/deps';

// ─── WS broadcast via injected deps ────────────────────────────────────────

async function broadcastBalance(orgId: string, balance: number) {
  try {
    getSubscriptionsDeps().broadcastEvent(`org:${orgId}`, 'token_balance_update', { balance, orgId, timestamp: new Date().toISOString() });
  } catch {
    // deps not ready or broadcast failed — fire-and-forget
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get token balance for an organization. Returns 0 if no balance record exists.
 */
export async function getTokenBalance(orgId: string): Promise<number> {
  const [row] = await db
    .select({ balance: saasTokenBalances.balance })
    .from(saasTokenBalances)
    .where(eq(saasTokenBalances.organizationId, orgId))
    .limit(1);
  return row?.balance ?? 0;
}

/**
 * Get full token balance record including lifetime stats.
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
 * Add tokens (credit). Used for purchases, bonuses, refunds.
 * Returns the new balance.
 */
export async function addTokens(
  orgId: string,
  amount: number,
  reason: string,
  metadata?: Record<string, unknown>,
): Promise<number> {
  if (amount <= 0) throw new Error('addTokens amount must be positive');

  const newBalance = await db.transaction(async (tx) => {
    // Upsert balance
    const [row] = await tx
      .insert(saasTokenBalances)
      .values({
        organizationId: orgId,
        balance: amount,
        lifetimeAdded: amount,
      })
      .onConflictDoUpdate({
        target: saasTokenBalances.organizationId,
        set: {
          balance: sql`${saasTokenBalances.balance} + ${amount}`,
          lifetimeAdded: sql`${saasTokenBalances.lifetimeAdded} + ${amount}`,
          updatedAt: new Date(),
        },
      })
      .returning({ balance: saasTokenBalances.balance });

    const balance = row!.balance;

    // Ledger entry
    await tx.insert(saasTokenTransactions).values({
      organizationId: orgId,
      amount,
      balanceAfter: balance,
      reason,
      metadata: metadata ?? null,
    });

    return balance;
  });

  logger.info('Tokens added', { orgId, amount, reason, newBalance });
  broadcastBalance(orgId, newBalance);
  return newBalance;
}

/**
 * Deduct tokens (debit). Used for feature usage, API calls, etc.
 * Returns the new balance, or throws if insufficient.
 *
 * Race-safe: uses atomic UPDATE ... WHERE balance >= amount (no SELECT-then-UPDATE gap).
 */
export async function deductTokens(
  orgId: string,
  amount: number,
  reason: string,
  metadata?: Record<string, unknown>,
): Promise<number> {
  if (amount <= 0) throw new Error('deductTokens amount must be positive');

  const newBalance = await db.transaction(async (tx) => {
    // Atomic deduct — WHERE clause prevents negative balance even under concurrency
    const [updated] = await tx
      .update(saasTokenBalances)
      .set({
        balance: sql`${saasTokenBalances.balance} - ${amount}`,
        lifetimeUsed: sql`${saasTokenBalances.lifetimeUsed} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(saasTokenBalances.organizationId, orgId),
          gte(saasTokenBalances.balance, amount),
        )
      )
      .returning({ balance: saasTokenBalances.balance });

    if (!updated) {
      // Either org has no balance record or insufficient tokens
      const current = await getTokenBalance(orgId);
      throw new Error(`Insufficient tokens: have ${current}, need ${amount}`);
    }

    // Ledger entry
    await tx.insert(saasTokenTransactions).values({
      organizationId: orgId,
      amount: -amount,
      balanceAfter: updated.balance,
      reason,
      metadata: metadata ?? null,
    });

    return updated.balance;
  });

  logger.info('Tokens deducted', { orgId, amount, reason, newBalance });
  broadcastBalance(orgId, newBalance);
  return newBalance;
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
