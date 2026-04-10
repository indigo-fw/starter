import { eq, and, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasDiscountCodes, saasDiscountUsages } from '@/core-subscriptions/schema/subscriptions';
import { DiscountType } from '@/core-payments/types/payment';
import type { DiscountDefinition, DiscountValidationResult } from '@/core-payments/types/payment';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('discount-service');

/**
 * Validate a discount code for a given user and plan.
 */
export async function validateCode(
  code: string,
  userId: string,
  planId: string,
  priceCents?: number,
): Promise<DiscountValidationResult> {
  const [discountCode] = await db
    .select()
    .from(saasDiscountCodes)
    .where(eq(saasDiscountCodes.code, code.toUpperCase()))
    .limit(1);

  if (!discountCode) {
    return { valid: false, message: 'Invalid discount code' };
  }

  if (!discountCode.isActive) {
    return { valid: false, message: 'This discount code is no longer active' };
  }

  // Check date window
  const now = new Date();
  if (discountCode.validFrom && now < discountCode.validFrom) {
    return { valid: false, message: 'This discount code is not yet active' };
  }
  if (discountCode.validUntil && now > discountCode.validUntil) {
    return { valid: false, message: 'This discount code has expired' };
  }

  // Check global usage cap
  if (discountCode.maxUses !== null && discountCode.currentUses >= discountCode.maxUses) {
    return { valid: false, message: 'This discount code has reached its usage limit' };
  }

  // Check per-user usage cap
  const userUsages = await db
    .select({ id: saasDiscountUsages.id })
    .from(saasDiscountUsages)
    .where(
      and(
        eq(saasDiscountUsages.userId, userId),
        eq(saasDiscountUsages.discountCodeId, discountCode.id),
        isNull(saasDiscountUsages.removedAt),
      )
    )
    .limit(discountCode.maxUsesPerUser + 1);

  if (userUsages.length >= discountCode.maxUsesPerUser) {
    return { valid: false, message: 'You have already used this discount code' };
  }

  // Resolve plan-specific override
  const discount = resolveDiscount(discountCode, planId);
  const finalPriceCents = priceCents !== undefined
    ? calculateFinalPrice(priceCents, discount)
    : undefined;

  return { valid: true, discount, finalPriceCents };
}

/**
 * Resolve the discount definition for a specific plan, falling back to global.
 */
function resolveDiscount(
  discountCode: typeof saasDiscountCodes.$inferSelect,
  planId: string,
): DiscountDefinition {
  // Check plan-specific overrides
  if (discountCode.planSpecificDiscounts) {
    const overrides = discountCode.planSpecificDiscounts as Record<string, DiscountDefinition>;
    if (overrides[planId]) {
      return overrides[planId];
    }
  }

  // Fall back to global discount
  return {
    type: discountCode.discountType as DiscountType,
    value: discountCode.discountValue ?? undefined,
    trialDays: discountCode.trialDays ?? undefined,
    trialPriceCents: discountCode.trialPriceCents ?? undefined,
  };
}

/**
 * Calculate the final price after applying a discount.
 */
export function calculateFinalPrice(
  priceCents: number,
  discount: DiscountDefinition,
): number {
  switch (discount.type) {
    case DiscountType.PERCENTAGE:
      return Math.round(priceCents * (1 - (discount.value ?? 0) / 100));
    case DiscountType.FIXED_PRICE:
      return discount.value ?? priceCents;
    case DiscountType.TRIAL:
      return discount.trialPriceCents ?? 0;
    case DiscountType.FREE_TRIAL:
      return 0;
    default:
      return priceCents;
  }
}

/**
 * Apply a discount code for a user. Idempotent: max 1 active discount per user.
 * Returns the usage record ID.
 */
export async function applyDiscount(
  code: string,
  userId: string,
  planId: string,
): Promise<{ usageId: string; discountCodeId: string; discount: DiscountDefinition }> {
  const [discountCode] = await db
    .select()
    .from(saasDiscountCodes)
    .where(eq(saasDiscountCodes.code, code.toUpperCase()))
    .limit(1);

  if (!discountCode) throw new Error('Invalid discount code');

  // Remove any existing active discount for this user
  await removeDiscount(userId);

  // Calculate expiration if time-limited
  let expiresAt: Date | null = null;
  if (discountCode.timeLimitHours) {
    expiresAt = new Date(Date.now() + discountCode.timeLimitHours * 60 * 60 * 1000);
  }

  const [usage] = await db
    .insert(saasDiscountUsages)
    .values({
      userId,
      discountCodeId: discountCode.id,
      planId,
      expiresAt,
    })
    .returning({ id: saasDiscountUsages.id });

  const discount = resolveDiscount(discountCode, planId);

  logger.info('Discount applied', { userId, code, planId });
  return { usageId: usage!.id, discountCodeId: discountCode.id, discount };
}

/**
 * Mark a discount usage as finalized (payment completed).
 * Atomically increments the global usage counter only if under the cap.
 */
export async function finalizeUsage(usageId: string, transactionId: string): Promise<void> {
  const [usage] = await db
    .select({
      discountCodeId: saasDiscountUsages.discountCodeId,
      usedAt: saasDiscountUsages.usedAt,
    })
    .from(saasDiscountUsages)
    .where(eq(saasDiscountUsages.id, usageId))
    .limit(1);

  if (!usage || usage.usedAt) return; // already finalized or not found

  await db
    .update(saasDiscountUsages)
    .set({ usedAt: new Date(), transactionId })
    .where(eq(saasDiscountUsages.id, usageId));

  // Atomic increment: only if current_uses < max_uses (or max_uses is null = unlimited)
  await db
    .update(saasDiscountCodes)
    .set({
      currentUses: sql`${saasDiscountCodes.currentUses} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(saasDiscountCodes.id, usage.discountCodeId),
        sql`(${saasDiscountCodes.maxUses} IS NULL OR ${saasDiscountCodes.currentUses} < ${saasDiscountCodes.maxUses})`,
      )
    );
}

/**
 * Remove the active discount for a user.
 */
export async function removeDiscount(userId: string): Promise<void> {
  await db
    .update(saasDiscountUsages)
    .set({ removedAt: new Date() })
    .where(
      and(
        eq(saasDiscountUsages.userId, userId),
        isNull(saasDiscountUsages.removedAt),
        isNull(saasDiscountUsages.usedAt),
      )
    );
}

/**
 * Get the currently active (applied but not used/removed/expired) discount for a user.
 */
export async function getActiveDiscount(userId: string) {
  const [usage] = await db
    .select({
      usageId: saasDiscountUsages.id,
      discountCodeId: saasDiscountUsages.discountCodeId,
      planId: saasDiscountUsages.planId,
      appliedAt: saasDiscountUsages.appliedAt,
      expiresAt: saasDiscountUsages.expiresAt,
      code: saasDiscountCodes.code,
      discountType: saasDiscountCodes.discountType,
      discountValue: saasDiscountCodes.discountValue,
      trialDays: saasDiscountCodes.trialDays,
      trialPriceCents: saasDiscountCodes.trialPriceCents,
    })
    .from(saasDiscountUsages)
    .innerJoin(saasDiscountCodes, eq(saasDiscountUsages.discountCodeId, saasDiscountCodes.id))
    .where(
      and(
        eq(saasDiscountUsages.userId, userId),
        isNull(saasDiscountUsages.removedAt),
        isNull(saasDiscountUsages.usedAt),
      )
    )
    .limit(1);

  if (!usage) return null;

  // Check if expired
  if (usage.expiresAt && new Date() > usage.expiresAt) {
    await db
      .update(saasDiscountUsages)
      .set({ removedAt: new Date() })
      .where(eq(saasDiscountUsages.id, usage.usageId));
    return null;
  }

  return usage;
}
