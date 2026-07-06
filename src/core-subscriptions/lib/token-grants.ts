/**
 * Token grants — the glue between subscriptions and token balances.
 *
 * Three grant paths:
 *
 * 1. Monthly subscription grants (`plan.monthlyTokens`) — granted every
 *    month while the subscription is active/trialing, regardless of billing
 *    interval (a yearly subscriber gets 12 monthly drips unless
 *    `yearlyTokenGrant: 'upfront'` credits monthlyTokens × 12 per period).
 *    Triggered instantly by subscription webhooks and swept daily by the
 *    `token-grants` cron (covers yearly anniversaries, NOWPayments, and
 *    missed webhooks). Grants land in the 'plan' bucket, which
 *    `resetBalanceOnGrant` may expire — purchased tokens are never touched.
 *
 * 2. Token pack purchases (`BillingConfig.tokenPacks`) — one-time Stripe
 *    checkout; the webhook credits the pack on `payment.completed` into the
 *    permanent 'purchased' bucket.
 *
 * 3. Signup bonus (`BillingConfig.signupBonusTokens`) — one-time grant for
 *    fresh orgs, wired through the `user.created` hook.
 *
 * Idempotency: each subscription carries `lastGrantPeriodKey` (the scheduled
 * grant date, anchored to the period start). Granting starts with an atomic
 * compare-and-set claim on that column inside the same transaction as the
 * token credit, so concurrent webhook + cron attempts can never double-grant
 * a period. Note: a mid-cycle plan change can move the anchor and cause one
 * early re-grant — accepted (the user just upgraded).
 */

import { and, asc, eq, gt, inArray, isNull, ne, or } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasSubscriptions } from '@/core-subscriptions/schema/subscriptions';
import {
  addTokens,
  broadcastTokenBalance,
  deductTokens,
  expirePlanTokens,
  expireDueTokenLots,
  findOrgsWithDueLots,
  getTokenBalance,
} from '@/core-subscriptions/lib/token-service';
import { getBillingConfig, getTokenPack } from '@/core-subscriptions/lib/billing-config';
import { getSubscriptionsDeps } from '@/core-subscriptions/deps';
import { runHook } from '@/core/lib/module/module-hooks';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import type { WebhookEvent } from '@/core-payments/types/payment';
import { createLogger } from '@/core/lib/infra/logger';

const log = createLogger('token-grants');

const GRANT_REASON = 'subscription_grant';
const GRANTABLE_STATUSES = ['active', 'trialing'];
const SWEEP_BATCH_SIZE = 200;
const SWEEP_CONCURRENCY = 10;

function toChunks<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// ─── Grant schedule math ────────────────────────────────────────────────────

/** Add N calendar months, clamping the day (Jan 31 + 1mo → Feb 28/29). */
export function addMonthsClamped(date: Date, months: number): Date {
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    Math.min(date.getUTCDate(), lastDay),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ));
}

/**
 * The key of the most recent scheduled grant date (anchor + k months) that
 * is <= now, as 'YYYY-MM-DD'. Null when the anchor is in the future.
 */
export function computeDuePeriodKey(anchor: Date, now: Date): string | null {
  if (anchor > now) return null;
  let k =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - anchor.getUTCMonth());
  if (addMonthsClamped(anchor, k) > now) k -= 1;
  if (k < 0) return null;
  return addMonthsClamped(anchor, k).toISOString().slice(0, 10);
}

// ─── Monthly subscription grants ────────────────────────────────────────────

interface GrantableSubscription {
  id: string;
  organizationId: string;
  planId: string;
  interval: string | null;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  createdAt: Date;
  lastGrantPeriodKey: string | null;
}

const GRANTABLE_COLUMNS = {
  id: saasSubscriptions.id,
  organizationId: saasSubscriptions.organizationId,
  planId: saasSubscriptions.planId,
  interval: saasSubscriptions.interval,
  status: saasSubscriptions.status,
  currentPeriodStart: saasSubscriptions.currentPeriodStart,
  currentPeriodEnd: saasSubscriptions.currentPeriodEnd,
  createdAt: saasSubscriptions.createdAt,
  lastGrantPeriodKey: saasSubscriptions.lastGrantPeriodKey,
};

/**
 * Shared yearly-interval heuristic: a billing period longer than any monthly
 * cycle could be. Used as fallback for rows that predate the `interval`
 * column, and by the webhook handler when a provider sends no price ID.
 */
export function isYearlyPeriodLength(start: Date | null | undefined, end: Date | null | undefined): boolean {
  if (!start || !end) return false;
  return end.getTime() - start.getTime() > 200 * 24 * 60 * 60 * 1000;
}

function isYearlyPeriod(sub: GrantableSubscription): boolean {
  // The interval recorded at activation is authoritative; the period-length
  // heuristic only covers rows from before the column existed.
  if (sub.interval) return sub.interval === 'yearly';
  return isYearlyPeriodLength(sub.currentPeriodStart, sub.currentPeriodEnd);
}

// ─── Claim-key encoding ─────────────────────────────────────────────────────
// lastGrantPeriodKey stores either a plain 'YYYY-MM-DD' (monthly drip) or
// 'U:YYYY-MM-DD' (upfront yearly grant). Keep ALL knowledge of the format in
// these two helpers — lexicographic comparisons on raw keys are only valid
// between plain date keys.

const UPFRONT_PREFIX = 'U:';

function upfrontClaimKey(dateKey: string): string {
  return `${UPFRONT_PREFIX}${dateKey}`;
}

function isUpfrontClaim(key: string): boolean {
  return key.startsWith(UPFRONT_PREFIX);
}

/**
 * Grant the plan's tokens to a subscription's org if a grant is due and not
 * yet claimed. Returns true when tokens were granted.
 *
 * Yearly subscriptions follow `BillingConfig.yearlyTokenGrant`: 'monthly'
 * (default) drips monthlyTokens on each monthly anniversary; 'upfront'
 * credits monthlyTokens × 12 once at the start of each yearly period.
 */
export async function grantDueSubscriptionTokens(sub: GrantableSubscription): Promise<boolean> {
  const plan = getSubscriptionsDeps().getPlan(sub.planId);
  const monthlyTokens = plan?.monthlyTokens ?? 0;
  if (monthlyTokens <= 0) return false;

  const anchor = sub.currentPeriodStart ?? sub.createdAt;
  if (anchor > new Date()) return false;

  const config = getBillingConfig();
  const trialing = sub.status === 'trialing';
  if (trialing && config.grantTokensDuringTrial === false) return false;

  // Upfront grants never fire during a trial: a trialing yearly subscription
  // would otherwise receive 12× before any payment (and again at conversion,
  // when the paid period start creates a fresh claim key). Trials stay on
  // the monthly drip; the upfront grant lands at first payment.
  const upfront = config.yearlyTokenGrant === 'upfront' && isYearlyPeriod(sub) && !trialing;
  const startKey = anchor.toISOString().slice(0, 10);
  const last = sub.lastGrantPeriodKey;

  // The claim key stored on the subscription lets each grant mode recognize
  // the other's grants, so flipping `yearlyTokenGrant` mid-period never
  // double-serves a period (the new mode kicks in at the next renewal).
  let periodKey: string;
  let claimKey: string;
  if (upfront) {
    periodKey = startKey;
    claimKey = upfrontClaimKey(startKey);
    // Monthly drips already granted within this period → wait for renewal
    if (last && (last === claimKey || (!isUpfrontClaim(last) && last >= startKey))) return false;
  } else {
    const due = computeDuePeriodKey(anchor, new Date());
    if (!due) return false;
    periodKey = due;
    claimKey = due;
    // This period was already granted upfront → no drips on top
    if (last && (last === claimKey || last === upfrontClaimKey(startKey))) return false;
  }

  const grantAmount = upfront ? monthlyTokens * 12 : monthlyTokens;

  // Claim + credit in one transaction: the compare-and-set on
  // lastGrantPeriodKey ensures exactly one grant per period even when the
  // webhook and the cron race, and a failed credit rolls the claim back.
  let grantedBalance: number | null = null;
  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(saasSubscriptions)
      .set({ lastGrantPeriodKey: claimKey, updatedAt: new Date() })
      .where(
        and(
          eq(saasSubscriptions.id, sub.id),
          or(
            isNull(saasSubscriptions.lastGrantPeriodKey),
            ne(saasSubscriptions.lastGrantPeriodKey, claimKey),
          ),
        )
      )
      .returning({ id: saasSubscriptions.id });

    if (!claimed) return;

    if (config.resetBalanceOnGrant) {
      await expirePlanTokens(sub.organizationId, { periodKey }, { tx });
    }

    // Per-grant validity: the grant becomes a lot expiring N months out
    const expiresAt = config.planTokenValidityMonths && config.planTokenValidityMonths > 0
      ? addMonthsClamped(new Date(), config.planTokenValidityMonths)
      : undefined;

    grantedBalance = await addTokens(
      sub.organizationId,
      grantAmount,
      GRANT_REASON,
      { periodKey, planId: sub.planId, ...(upfront && { upfront: true }) },
      { bucket: 'plan', tx, expiresAt },
    );
  });

  if (grantedBalance === null) return false;

  // Composed token ops skip WS broadcasts — announce only after the commit,
  // so clients never see a grant that could still roll back
  broadcastTokenBalance(sub.organizationId, grantedBalance);

  getSubscriptionsDeps().sendOrgNotification(sub.organizationId, {
    title: upfront ? 'Yearly tokens added' : 'Monthly tokens added',
    body: `${grantAmount.toLocaleString()} tokens from your ${plan?.name ?? sub.planId} plan have been added to your balance.`,
    type: NotificationType.SUCCESS,
    category: NotificationCategory.BILLING,
    actionUrl: '/account/billing',
  });

  log.info('Subscription tokens granted', { orgId: sub.organizationId, planId: sub.planId, grantAmount, periodKey, upfront });
  return true;
}

/**
 * Grant any due monthly tokens for one org (looked up by its subscription).
 * Called from the subscription webhook handler so activations and renewals
 * credit tokens immediately instead of waiting for the daily cron.
 */
export async function grantSubscriptionTokensForOrg(orgId: string): Promise<void> {
  const [sub] = await db
    .select(GRANTABLE_COLUMNS)
    .from(saasSubscriptions)
    .where(
      and(
        eq(saasSubscriptions.organizationId, orgId),
        inArray(saasSubscriptions.status, GRANTABLE_STATUSES),
      )
    )
    .limit(1);

  if (!sub) return;

  try {
    await grantDueSubscriptionTokens(sub);
  } catch (err) {
    log.error('Subscription token grant failed', { orgId, error: String(err) });
  }
}

/**
 * Daily cron sweep: grant due monthly tokens across all active/trialing
 * subscriptions on token-granting plans. Covers yearly-interval anniversaries
 * (no provider webhook fires monthly for those), non-Stripe providers, and
 * any webhook the server missed. Paginates by keyset so any number of
 * subscriptions is processed. No-op when no plan defines monthlyTokens.
 */
export async function runTokenGrantChecks(): Promise<void> {
  // Sweep overdue grant lots first — expired tokens must be gone before new
  // grants land (also happens lazily on every spend)
  try {
    const dueOrgs = await findOrgsWithDueLots();
    for (const chunk of toChunks(dueOrgs, SWEEP_CONCURRENCY)) {
      await Promise.all(chunk.map((orgId) =>
        expireDueTokenLots(orgId).catch((err) =>
          log.error('Token lot expiry failed', { orgId, error: String(err) }))
      ));
    }
    if (dueOrgs.length > 0) log.info(`Expired due token lots for ${dueOrgs.length} orgs`);
  } catch (err) {
    log.error('Token lot expiry sweep failed', { error: String(err) });
  }

  const tokenPlanIds = getSubscriptionsDeps()
    .getPlans()
    .filter((p) => (p.monthlyTokens ?? 0) > 0)
    .map((p) => p.id);

  if (tokenPlanIds.length === 0) return;

  let granted = 0;
  let scanned = 0;
  let cursor: string | null = null;

  for (;;) {
    const batch: GrantableSubscription[] = await db
      .select(GRANTABLE_COLUMNS)
      .from(saasSubscriptions)
      .where(
        and(
          inArray(saasSubscriptions.status, GRANTABLE_STATUSES),
          inArray(saasSubscriptions.planId, tokenPlanIds),
          ...(cursor ? [gt(saasSubscriptions.id, cursor)] : []),
        )
      )
      .orderBy(asc(saasSubscriptions.id))
      .limit(SWEEP_BATCH_SIZE);

    // Grants are race-safe (per-subscription compare-and-set + per-org row
    // lock), so bounded concurrency is fine and keeps grant day fast
    for (const chunk of toChunks(batch, SWEEP_CONCURRENCY)) {
      const results = await Promise.all(chunk.map((sub) =>
        grantDueSubscriptionTokens(sub).catch((err) => {
          log.error('Token grant failed', { orgId: sub.organizationId, error: String(err) });
          return false;
        })
      ));
      granted += results.filter(Boolean).length;
    }

    scanned += batch.length;
    if (batch.length < SWEEP_BATCH_SIZE) break;
    cursor = batch[batch.length - 1]!.id;
  }

  if (granted > 0) log.info(`Token grant sweep complete: ${granted}/${scanned} subscriptions credited`);
}

// ─── Signup bonus ───────────────────────────────────────────────────────────

/**
 * One-time signup token grant for a fresh org. No-op unless
 * `BillingConfig.signupBonusTokens` is set. Wired via the `user.created` hook.
 */
export async function grantSignupBonusTokens(orgId: string | null): Promise<void> {
  const bonus = getBillingConfig().signupBonusTokens ?? 0;
  if (bonus <= 0 || !orgId) return;
  try {
    await addTokens(orgId, bonus, 'bonus', { grant: 'signup' }, { bucket: 'purchased' });
  } catch (err) {
    log.warn('Signup bonus grant failed', { orgId, error: String(err) });
  }
}

// ─── Token pack purchases ───────────────────────────────────────────────────

export interface TokenPackWebhookParams {
  event: WebhookEvent;
  providerId: string;
}

/**
 * Handle a token-pack payment webhook (routed by `metadata.type === 'token_pack'`).
 * Credits the pack on `payment.completed`; claws the tokens back (clamped to
 * the remaining balance) on `payment.refunded`. Duplicate delivery is already
 * filtered by the webhook route's idempotency table.
 */
export async function handleTokenPackWebhookEvent({ event, providerId }: TokenPackWebhookParams): Promise<{ credited: boolean }> {
  const providerData = event.providerData as Record<string, unknown> | undefined;
  const metadata = (providerData?.metadata ?? {}) as Record<string, string>;
  const { orgId, packId, userId } = metadata;

  if (event.type !== 'payment.completed' && event.type !== 'payment.refunded') {
    log.info('Ignoring token pack event', { type: event.type, packId, providerId });
    return { credited: false };
  }

  const pack = packId ? getTokenPack(packId) : undefined;

  if (event.type === 'payment.refunded') {
    // Only fully-refunded charges are routed here (the Stripe provider strips
    // metadata from partial-refund events). Claw back the pack — from the
    // purchased bucket first, since that's where the pack was credited —
    // clamped in-transaction so it never overdrafts under concurrent spends.
    if (!orgId || !pack) {
      log.error('Token pack refund not processable', { orgId, packId, providerId });
      return { credited: false };
    }
    const clawback = Math.min(pack.tokens, await getTokenBalance(orgId));
    if (clawback > 0) {
      await deductTokens(
        orgId,
        clawback,
        'refund',
        { packId, providerId, eventId: providerData?._eventId },
        { spendOrder: 'purchased-first', clamp: true },
      );
    }
    getSubscriptionsDeps().sendOrgNotification(orgId, {
      title: 'Token purchase refunded',
      body: `Your ${pack.name} purchase was refunded and the purchased tokens were removed from your balance.`,
      type: NotificationType.WARNING,
      category: NotificationCategory.BILLING,
      actionUrl: '/account/billing',
    });
    log.info('Token pack refunded', { orgId, packId, clawback, providerId });
    return { credited: false };
  }

  // payment.completed: a failed credit here must NOT be acked — the customer
  // has been charged. Throwing makes the webhook route return 500 (releasing
  // its idempotency claim) so the provider retries until it succeeds or an
  // operator intervenes.
  if (!orgId || !packId) {
    throw new Error(`Token pack payment missing orgId/packId metadata (provider ${providerId})`);
  }
  if (!pack) {
    throw new Error(`Token pack "${packId}" not found in billing config — customer paid but cannot be credited`);
  }

  await addTokens(
    orgId,
    pack.tokens,
    'purchase',
    { packId, providerId, eventId: providerData?._eventId },
    { bucket: 'purchased' },
  );

  getSubscriptionsDeps().sendOrgNotification(orgId, {
    title: 'Tokens purchased',
    body: `${pack.tokens.toLocaleString()} tokens (${pack.name}) have been added to your balance.`,
    type: NotificationType.SUCCESS,
    category: NotificationCategory.BILLING,
    actionUrl: '/account/billing',
  });

  // Record affiliate conversion, mirroring the subscription checkout path
  if (userId) {
    runHook('payment.conversion', userId, `token_pack:${packId}`, pack.priceCents);
  }

  log.info('Token pack credited', { orgId, packId, tokens: pack.tokens, providerId });
  return { credited: true };
}
