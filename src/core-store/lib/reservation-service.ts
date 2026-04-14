import { eq, and, sql, lt } from 'drizzle-orm';
import { db } from '@/server/db';
import { storeInventoryReservations } from '@/core-store/schema/inventory';
import { storeProducts, storeProductVariants } from '@/core-store/schema/products';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-reservations');

export const RESERVATION_TTL_MINUTES = 15;

/**
 * Reserve stock for a cart item. Replaces any existing reservation
 * for the same cart+product+variant combination.
 */
export async function reserveStock(
  cartId: string,
  productId: string,
  variantId: string | null,
  quantity: number,
): Promise<void> {
  // Remove existing reservation for this cart+product+variant
  await db.delete(storeInventoryReservations).where(
    and(
      eq(storeInventoryReservations.cartId, cartId),
      eq(storeInventoryReservations.productId, productId),
      variantId
        ? eq(storeInventoryReservations.variantId, variantId)
        : sql`${storeInventoryReservations.variantId} IS NULL`,
    ),
  );

  // Insert new reservation
  await db.insert(storeInventoryReservations).values({
    cartId,
    productId,
    variantId,
    quantity,
    expiresAt: new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000),
  });
}

/**
 * Release all reservations for a cart (e.g. on cart clear or order placement).
 */
export async function releaseCartReservations(cartId: string): Promise<void> {
  await db.delete(storeInventoryReservations).where(
    eq(storeInventoryReservations.cartId, cartId),
  );
}

/**
 * Release all expired reservations. Called by maintenance task.
 */
export async function releaseExpiredReservations(): Promise<{ released: number }> {
  const deleted = await db.delete(storeInventoryReservations)
    .where(lt(storeInventoryReservations.expiresAt, new Date()))
    .returning({ id: storeInventoryReservations.id });

  const released = deleted.length;
  if (released > 0) {
    logger.info('Released expired stock reservations', { released });
  }
  return { released };
}

/**
 * Get available stock for a product or variant, accounting for active reservations.
 */
export async function getAvailableStock(
  productId: string,
  variantId?: string | null,
): Promise<number> {
  // Get current stock
  let stock = 0;

  if (variantId) {
    const [variant] = await db
      .select({ stockQuantity: storeProductVariants.stockQuantity })
      .from(storeProductVariants)
      .where(eq(storeProductVariants.id, variantId))
      .limit(1);
    stock = variant?.stockQuantity ?? 0;
  } else {
    const [product] = await db
      .select({ stockQuantity: storeProducts.stockQuantity })
      .from(storeProducts)
      .where(eq(storeProducts.id, productId))
      .limit(1);
    stock = product?.stockQuantity ?? 0;
  }

  // Subtract active (non-expired) reservations
  const [reserved] = await db
    .select({ total: sql<number>`COALESCE(SUM(${storeInventoryReservations.quantity}), 0)` })
    .from(storeInventoryReservations)
    .where(
      and(
        eq(storeInventoryReservations.productId, productId),
        variantId
          ? eq(storeInventoryReservations.variantId, variantId)
          : sql`${storeInventoryReservations.variantId} IS NULL`,
        sql`${storeInventoryReservations.expiresAt} >= NOW()`,
      ),
    );

  const reservedQty = Number(reserved?.total ?? 0);
  return Math.max(0, stock - reservedQty);
}

/**
 * Convert cart reservations into actual stock deductions when an order is confirmed.
 * Replaces inline stock deduction — deducts from product/variant, deletes reservations,
 * and checks for low stock alerts.
 */
export async function convertReservationsToDeduction(
  cartId: string,
  _orderId: string,
): Promise<void> {
  const reservations = await db
    .select()
    .from(storeInventoryReservations)
    .where(eq(storeInventoryReservations.cartId, cartId))
    .limit(200);

  for (const res of reservations) {
    // Deduct stock
    if (res.variantId) {
      await db.update(storeProductVariants)
        .set({ stockQuantity: sql`${storeProductVariants.stockQuantity} - ${res.quantity}` })
        .where(eq(storeProductVariants.id, res.variantId));
    } else {
      await db.update(storeProducts)
        .set({ stockQuantity: sql`${storeProducts.stockQuantity} - ${res.quantity}` })
        .where(eq(storeProducts.id, res.productId));
    }

    // Check low stock (dynamic import to avoid circular deps)
    const { checkLowStock } = await import('./inventory-alerts');
    checkLowStock(res.productId, res.variantId ?? undefined).catch(() => {});
  }

  // Delete all reservations for this cart
  await db.delete(storeInventoryReservations).where(
    eq(storeInventoryReservations.cartId, cartId),
  );

  logger.info('Converted reservations to stock deductions', {
    cartId,
    count: reservations.length,
  });
}

// ─── Maintenance Task ──────────────────────────────────────────────────────

import { registerMaintenanceTask } from '@/core/lib/infra/maintenance';

registerMaintenanceTask('releaseExpiredStockReservations', async () => {
  const result = await releaseExpiredReservations();
  if (result.released > 0) {
    logger.info('Released expired stock reservations', result);
  }
});
