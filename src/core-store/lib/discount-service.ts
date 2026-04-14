import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { TRPCError } from '@trpc/server';
import { storeDiscountCodes, storeDiscountUsage } from '../schema/discount-codes';
import type { CartItemDetail } from './cart-service';

export interface DiscountResult {
  discountId: string;
  code: string;
  type: 'percentage' | 'fixed_amount';
  discountCents: number;
  /** Whether this discount can be combined with other discounts */
  stackable?: boolean;
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
    stackable: discount.stackable,
  };
}

/**
 * Record usage after successful order.
 * Inserts a usage record and increments the global usage counter.
 */
export async function recordDiscountUsage(params: {
  discountCodeId: string;
  userId?: string;
  orderId: string;
}): Promise<void> {
  // Insert usage record
  await db.insert(storeDiscountUsage).values({
    discountCodeId: params.discountCodeId,
    userId: params.userId ?? null,
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

// ---------------------------------------------------------------------------
// Auto-apply discounts
// ---------------------------------------------------------------------------

/**
 * Find and calculate all auto-apply discounts applicable to the current cart.
 * Returns an array of applicable discounts (may be empty).
 */
export async function getAutoApplyDiscounts(params: {
  subtotalCents: number;
  items: CartItemDetail[];
  userId: string;
  currency: string;
}): Promise<DiscountResult[]> {
  const now = new Date();

  // 1. Fetch all active auto-apply discounts
  const discounts = await db
    .select()
    .from(storeDiscountCodes)
    .where(
      and(
        eq(storeDiscountCodes.isActive, true),
        eq(storeDiscountCodes.autoApply, true),
      ),
    )
    .limit(50);

  const results: DiscountResult[] = [];

  for (const discount of discounts) {
    // 2. Filter by date range
    if (discount.startsAt && discount.startsAt > now) continue;
    if (discount.expiresAt && discount.expiresAt < now) continue;

    // 3. Filter by minimum order amount
    if (discount.minOrderCents !== null && params.subtotalCents < discount.minOrderCents) continue;

    // 4. Check global usage limit
    if (discount.maxUses !== null && discount.usedCount >= discount.maxUses) continue;

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
      if (userUsageCount >= discount.maxUsesPerUser) continue;
    }

    // 6. Validate currency for fixed_amount discounts
    if (discount.type === 'fixed_amount' && discount.currency !== params.currency) continue;

    // 7. Check stacking — if not stackable and we already have results, skip
    if (!discount.stackable && results.length > 0) continue;

    // 8. Calculate discount amount
    let discountCents: number;

    if (discount.type === 'percentage') {
      discountCents = Math.round(params.subtotalCents * discount.value / 100);
      if (discount.maxDiscountCents !== null && discountCents > discount.maxDiscountCents) {
        discountCents = discount.maxDiscountCents;
      }
    } else {
      discountCents = Math.min(discount.value, params.subtotalCents);
    }

    discountCents = Math.max(0, discountCents);
    if (discountCents === 0) continue;

    results.push({
      discountId: discount.id,
      code: discount.code,
      type: discount.type as 'percentage' | 'fixed_amount',
      discountCents,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// BOGO (Buy One Get One) validation
// ---------------------------------------------------------------------------

interface BogoConfig {
  buyProductId: string;
  buyQuantity: number;
  getProductId: string;
  getQuantity: number;
  getDiscountPercent: number;
}

/**
 * Validate a BOGO discount against the cart items.
 * Returns the free item details if the cart qualifies, or null.
 */
export function validateBogoDiscount(
  discount: typeof storeDiscountCodes.$inferSelect,
  items: { productId: string; quantity: number }[],
): { freeItemProductId: string; freeItemQuantity: number; discountPercent: number } | null {
  if (!discount.bogoConfig) return null;

  const config = discount.bogoConfig as BogoConfig;

  // Check required fields
  if (!config.buyProductId || !config.buyQuantity || !config.getProductId) return null;

  // Check if cart has the required buy product with sufficient quantity
  const buyItem = items.find((item) => item.productId === config.buyProductId);
  if (!buyItem || buyItem.quantity < config.buyQuantity) return null;

  return {
    freeItemProductId: config.getProductId,
    freeItemQuantity: config.getQuantity ?? 1,
    discountPercent: config.getDiscountPercent ?? 100,
  };
}

// ---------------------------------------------------------------------------
// Register auto-apply as a totals pipeline collector (sortOrder 95)
// ---------------------------------------------------------------------------
//
// Lazy import avoids circular dependency: totals-pipeline imports from this
// file, and we import registerTotalsCollector from totals-pipeline.
//

import('./totals-pipeline').then(({ registerTotalsCollector }) => {
  registerTotalsCollector({
    code: 'auto-discount',
    label: 'Automatic Discount',
    sortOrder: 95,
    async collect(ctx) {
      const userId = ctx.extensions.userId as string | undefined;
      if (!userId) return;

      const autoDiscounts = await getAutoApplyDiscounts({
        subtotalCents: ctx.runningTotalCents,
        items: ctx.cart.items,
        userId,
        currency: ctx.cart.currency,
      });

      for (const discount of autoDiscounts) {
        ctx.adjustments.push({
          code: 'auto-discount',
          label: `Auto: ${discount.code}`,
          amountCents: -discount.discountCents,
          metadata: { discountId: discount.discountId, type: discount.type },
        });
        ctx.runningTotalCents -= discount.discountCents;
      }
    },
  });
});
