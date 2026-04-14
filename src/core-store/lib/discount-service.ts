import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { TRPCError } from '@trpc/server';
import { storeDiscountCodes, storeDiscountUsage } from '../schema/discount-codes';

export interface DiscountResult {
  discountId: string;
  code: string;
  type: 'percentage' | 'fixed_amount';
  discountCents: number;
}

/**
 * Validate and calculate discount for a given code.
 * Throws TRPCError if invalid.
 */
export async function validateDiscount(params: {
  code: string;
  subtotalCents: number;
  userId: string;
  currency: string;
}): Promise<DiscountResult> {
  const normalizedCode = params.code.trim().toUpperCase();

  // 1. Find the discount code
  const [discount] = await db
    .select()
    .from(storeDiscountCodes)
    .where(eq(storeDiscountCodes.code, normalizedCode))
    .limit(1);

  if (!discount) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid discount code' });
  }

  // 2. Check isActive
  if (!discount.isActive) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'This discount code is no longer active' });
  }

  // 3. Check date range
  const now = new Date();

  if (discount.startsAt && discount.startsAt > now) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'This discount code is not yet active' });
  }

  if (discount.expiresAt && discount.expiresAt < now) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'This discount code has expired' });
  }

  // 4. Check global usage limit
  if (discount.maxUses !== null && discount.usedCount >= discount.maxUses) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'This discount code has reached its usage limit' });
  }

  // 5. Check per-user usage limit
  if (discount.maxUsesPerUser !== null) {
    const [usageRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(storeDiscountUsage)
      .where(
        and(
          eq(storeDiscountUsage.discountCodeId, discount.id),
          eq(storeDiscountUsage.userId, params.userId),
        ),
      );

    const userUsageCount = usageRow?.count ?? 0;

    if (userUsageCount >= discount.maxUsesPerUser) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'You have already used this discount code the maximum number of times' });
    }
  }

  // 6. Check minimum order amount
  if (discount.minOrderCents !== null && params.subtotalCents < discount.minOrderCents) {
    const minAmount = (discount.minOrderCents / 100).toFixed(2);
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Minimum order amount of ${minAmount} ${discount.currency} required for this discount`,
    });
  }

  // 7. Validate currency for fixed_amount discounts
  if (discount.type === 'fixed_amount' && discount.currency !== params.currency) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `This discount code is only valid for ${discount.currency} orders`,
    });
  }

  // 8. Calculate discount
  let discountCents: number;

  if (discount.type === 'percentage') {
    discountCents = Math.round(params.subtotalCents * discount.value / 100);

    // Cap by maxDiscountCents if set
    if (discount.maxDiscountCents !== null && discountCents > discount.maxDiscountCents) {
      discountCents = discount.maxDiscountCents;
    }
  } else {
    // fixed_amount: value is already in cents, but never more than subtotal
    discountCents = Math.min(discount.value, params.subtotalCents);
  }

  // Ensure discount is never negative
  discountCents = Math.max(0, discountCents);

  return {
    discountId: discount.id,
    code: discount.code,
    type: discount.type as 'percentage' | 'fixed_amount',
    discountCents,
  };
}

/**
 * Record usage after successful order.
 * Inserts a usage record and increments the global usage counter.
 */
export async function recordDiscountUsage(params: {
  discountCodeId: string;
  userId: string;
  orderId: string;
}): Promise<void> {
  // Insert usage record
  await db.insert(storeDiscountUsage).values({
    discountCodeId: params.discountCodeId,
    userId: params.userId,
    orderId: params.orderId,
  });

  // Increment usedCount on the discount code
  await db
    .update(storeDiscountCodes)
    .set({
      usedCount: sql`${storeDiscountCodes.usedCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(storeDiscountCodes.id, params.discountCodeId));
}
