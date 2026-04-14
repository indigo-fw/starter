import { and, lt, isNotNull, sql, eq, exists } from 'drizzle-orm';
import { db } from '@/server/db';
import { storeCarts, storeCartItems } from '@/core-store/schema/orders';
import { storeProducts } from '@/core-store/schema/products';
import { user } from '@/server/db/schema/auth';
import { storeOrders } from '@/core-store/schema/orders';
import { getStoreDeps } from '@/core-store/deps';
import { registerMaintenanceTask } from '@/core/lib/infra/maintenance';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-abandoned-carts');

/** How long before a cart is considered abandoned (hours) */
const ABANDONED_THRESHOLD_HOURS = 24;

/**
 * Check if a reminder was already sent for this cart by inspecting
 * the cart's metadata JSONB column.
 */
function hasReminderFlag(metadata: unknown): boolean {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return (metadata as Record<string, unknown>).abandoned_reminder_sent === true;
  }
  return false;
}

/**
 * Find and process abandoned carts — send reminder emails to users
 * who left items in their cart without completing checkout.
 */
async function processAbandonedCarts(): Promise<void> {
  const cutoff = new Date(Date.now() - ABANDONED_THRESHOLD_HOURS * 60 * 60 * 1000);

  try {
    // Find carts that:
    // 1. Were last updated before the cutoff
    // 2. Belong to a logged-in user (so we have an email)
    // 3. Have at least one item
    const abandonedCarts = await db
      .select({
        cartId: storeCarts.id,
        userId: storeCarts.userId,
        metadata: storeCarts.metadata,
        updatedAt: storeCarts.updatedAt,
      })
      .from(storeCarts)
      .where(
        and(
          lt(storeCarts.updatedAt, cutoff),
          isNotNull(storeCarts.userId),
          exists(
            db
              .select({ one: sql`1` })
              .from(storeCartItems)
              .where(eq(storeCartItems.cartId, storeCarts.id)),
          ),
        ),
      )
      .limit(200);

    let sentCount = 0;

    for (const cart of abandonedCarts) {
      // Skip if reminder already sent
      if (hasReminderFlag(cart.metadata)) {
        continue;
      }

      // Skip if user placed an order after the cart was last updated
      const [recentOrder] = await db
        .select({ id: storeOrders.id })
        .from(storeOrders)
        .where(
          and(
            eq(storeOrders.placedByUserId, cart.userId!),
            sql`${storeOrders.createdAt} > ${cart.updatedAt}`,
          ),
        )
        .limit(1);

      if (recentOrder) {
        continue;
      }

      // Get user email
      const [cartUser] = await db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, cart.userId!))
        .limit(1);

      if (!cartUser?.email) {
        continue;
      }

      // Get cart items with product names
      const items = await db
        .select({
          productName: storeProducts.name,
          quantity: storeCartItems.quantity,
          unitPriceCents: storeCartItems.unitPriceCents,
        })
        .from(storeCartItems)
        .innerJoin(storeProducts, eq(storeCartItems.productId, storeProducts.id))
        .where(eq(storeCartItems.cartId, cart.cartId))
        .limit(20);

      if (items.length === 0) {
        continue;
      }

      const itemSummary = items
        .map((item) => `${item.productName} (x${item.quantity})`)
        .join(', ');

      // Send abandoned cart email
      const deps = getStoreDeps();
      await deps.enqueueTemplateEmail(cartUser.email, 'abandoned-cart', {
        itemSummary,
        itemCount: items.length,
      });

      // Mark cart as reminded to prevent duplicate sends
      await db
        .update(storeCarts)
        .set({
          metadata: sql`COALESCE(${storeCarts.metadata}, '{}'::jsonb) || '{"abandoned_reminder_sent": true}'::jsonb`,
        })
        .where(eq(storeCarts.id, cart.cartId));

      sentCount++;
    }

    if (sentCount > 0) {
      logger.info('Abandoned cart reminders sent', { count: sentCount });
    }
  } catch (error) {
    logger.error('Failed to process abandoned carts', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Register as a daily maintenance task (runs at 3 AM)
registerMaintenanceTask('cleanupAbandonedCarts', processAbandonedCarts);
