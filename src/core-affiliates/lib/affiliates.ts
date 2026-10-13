import { and, eq, inArray, sql } from 'drizzle-orm';

import {
  saasAffiliateEvents,
  saasAffiliates,
  saasReferrals,
} from '@/core-affiliates/schema/affiliates';
import { createLogger } from '@/core/lib/infra/logger';
import { db } from '@/server/db';

const log = createLogger('affiliates');

/**
 * Capture a referral after user registration.
 * Looks up affiliate by code, verifies active, creates referral record.
 * Fire-and-forget — catches all errors.
 */
export async function captureReferral(
  userId: string,
  refCode: string
): Promise<void> {
  try {
    const [affiliate] = await db
      .select({ id: saasAffiliates.id, userId: saasAffiliates.userId })
      .from(saasAffiliates)
      .where(
        and(
          eq(saasAffiliates.code, refCode),
          eq(saasAffiliates.status, 'active')
        )
      )
      .limit(1);

    if (!affiliate) {
      log.debug('No active affiliate for code', { refCode });
      return;
    }

    // Prevent self-referral
    if (affiliate.userId === userId) {
      log.debug('Self-referral blocked', { userId, refCode });
      return;
    }

    // Check if referral already exists
    const [existing] = await db
      .select({ id: saasReferrals.id })
      .from(saasReferrals)
      .where(
        and(
          eq(saasReferrals.affiliateId, affiliate.id),
          eq(saasReferrals.referredUserId, userId)
        )
      )
      .limit(1);

    if (existing) {
      log.debug('Referral already exists', {
        affiliateId: affiliate.id,
        userId,
      });
      return;
    }

    const referralId = crypto.randomUUID();
    await db.insert(saasReferrals).values({
      id: referralId,
      affiliateId: affiliate.id,
      referredUserId: userId,
    });

    // Log signup event
    await db.insert(saasAffiliateEvents).values({
      affiliateId: affiliate.id,
      referralId,
      type: 'signup',
    });

    // Increment total referrals
    await db
      .update(saasAffiliates)
      .set({ totalReferrals: sql`${saasAffiliates.totalReferrals} + 1` })
      .where(eq(saasAffiliates.id, affiliate.id));

    log.info('Referral captured', {
      affiliateId: affiliate.id,
      userId,
      refCode,
    });
  } catch (err) {
    log.error('Failed to capture referral', {
      userId,
      refCode,
      error: String(err),
    });
  }
}

/**
 * Record a conversion (payment) for an affiliate referral.
 * Called from payment webhook handlers after successful payment.
 * Fire-and-forget — catches all errors.
 */
export async function recordConversion(
  userId: string,
  transactionId: string,
  amountCents: number
): Promise<void> {
  try {
    // Find pending referral for this user
    const [referral] = await db
      .select({
        id: saasReferrals.id,
        affiliateId: saasReferrals.affiliateId,
      })
      .from(saasReferrals)
      .where(
        and(
          eq(saasReferrals.referredUserId, userId),
          eq(saasReferrals.status, 'pending')
        )
      )
      .limit(1);

    if (!referral) return;

    // Get affiliate commission rate
    const [affiliate] = await db
      .select({ commissionPercent: saasAffiliates.commissionPercent })
      .from(saasAffiliates)
      .where(eq(saasAffiliates.id, referral.affiliateId))
      .limit(1);

    if (!affiliate) return;

    const commissionCents = Math.round(
      (amountCents * affiliate.commissionPercent) / 100
    );

    // Mark referral as converted
    await db
      .update(saasReferrals)
      .set({ status: 'converted', convertedAt: new Date() })
      .where(eq(saasReferrals.id, referral.id));

    // Log purchase event
    await db.insert(saasAffiliateEvents).values({
      affiliateId: referral.affiliateId,
      referralId: referral.id,
      type: 'purchase',
      amountCents,
      metadata: { transactionId },
    });

    // Log commission event
    await db.insert(saasAffiliateEvents).values({
      affiliateId: referral.affiliateId,
      referralId: referral.id,
      type: 'commission',
      amountCents: commissionCents,
      metadata: { transactionId, rate: affiliate.commissionPercent },
    });

    // Update affiliate totals
    await db
      .update(saasAffiliates)
      .set({
        totalEarningsCents: sql`${saasAffiliates.totalEarningsCents} + ${commissionCents}`,
        updatedAt: new Date(),
      })
      .where(eq(saasAffiliates.id, referral.affiliateId));

    log.info('Conversion recorded', {
      affiliateId: referral.affiliateId,
      userId,
      amountCents,
      commissionCents,
    });
  } catch (err) {
    log.error('Failed to record conversion', {
      userId,
      transactionId,
      error: String(err),
    });
  }
}

/**
 * Claw back the commission paid for a refunded conversion. The counterpart of
 * `recordConversion`: without it a refunded purchase keeps paying the
 * affiliate, and `totalEarningsCents` overstates what is actually owed.
 *
 * `transactionId` must match the one passed to `recordConversion`. The paid
 * commission is read from the event log (not recomputed from the current rate,
 * which may have changed since) and scaled by refunded/purchased so a partial
 * refund claws back proportionally. Idempotent per transaction — webhooks are
 * redelivered. Fire-and-forget — catches all errors.
 */
export async function recordRefund(
  userId: string,
  transactionId: string,
  amountRefundedCents: number
): Promise<void> {
  try {
    const [referral] = await db
      .select({ id: saasReferrals.id, affiliateId: saasReferrals.affiliateId })
      .from(saasReferrals)
      .where(
        and(
          eq(saasReferrals.referredUserId, userId),
          eq(saasReferrals.status, 'converted')
        )
      )
      .limit(1);

    if (!referral) return;

    const events = await db
      .select({
        type: saasAffiliateEvents.type,
        amountCents: saasAffiliateEvents.amountCents,
      })
      .from(saasAffiliateEvents)
      .where(
        and(
          eq(saasAffiliateEvents.affiliateId, referral.affiliateId),
          inArray(saasAffiliateEvents.type, [
            'purchase',
            'commission',
            'clawback',
          ]),
          sql`${saasAffiliateEvents.metadata}->>'transactionId' = ${transactionId}`
        )
      )
      .limit(10);

    if (events.some((e) => e.type === 'clawback')) {
      log.debug('Refund already clawed back', { transactionId });
      return;
    }
    const purchaseCents =
      events.find((e) => e.type === 'purchase')?.amountCents ?? 0;
    const commissionCents =
      events.find((e) => e.type === 'commission')?.amountCents ?? 0;
    if (commissionCents <= 0) return;

    const ratio =
      purchaseCents > 0 ? Math.min(1, amountRefundedCents / purchaseCents) : 1;
    const clawbackCents = Math.min(
      commissionCents,
      Math.round(commissionCents * ratio)
    );
    if (clawbackCents <= 0) return;

    await db.insert(saasAffiliateEvents).values([
      {
        affiliateId: referral.affiliateId,
        referralId: referral.id,
        type: 'refund',
        amountCents: amountRefundedCents,
        metadata: { transactionId },
      },
      {
        affiliateId: referral.affiliateId,
        referralId: referral.id,
        type: 'clawback',
        amountCents: clawbackCents,
        metadata: {
          transactionId,
          refundedCents: amountRefundedCents,
          purchaseCents,
        },
      },
    ]);

    // Never below zero: an affiliate whose earnings were already paid out is a
    // bookkeeping matter for the project, not a negative balance here.
    await db
      .update(saasAffiliates)
      .set({
        totalEarningsCents: sql`GREATEST(${saasAffiliates.totalEarningsCents} - ${clawbackCents}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(saasAffiliates.id, referral.affiliateId));

    log.info('Refund clawed back', {
      affiliateId: referral.affiliateId,
      userId,
      transactionId,
      amountRefundedCents,
      clawbackCents,
    });
  } catch (err) {
    log.error('Failed to record refund', {
      userId,
      transactionId,
      error: String(err),
    });
  }
}
