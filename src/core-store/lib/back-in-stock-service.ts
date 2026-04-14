import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { storeBackInStockAlerts } from '@/core-store/schema/alerts';
import { storeProducts } from '@/core-store/schema/products';
import { user } from '@/server/db/schema/auth';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-back-in-stock');

// ---------------------------------------------------------------------------
// Subscribe / Unsubscribe
// ---------------------------------------------------------------------------

/** Subscribe a user to back-in-stock alerts for a product (or variant). */
export async function subscribe(
  userId: string,
  productId: string,
  variantId?: string | null,
): Promise<void> {
  await db
    .insert(storeBackInStockAlerts)
    .values({
      userId,
      productId,
      variantId: variantId ?? null,
    })
    .onConflictDoNothing();
}

/** Remove a user's back-in-stock subscription. */
export async function unsubscribe(
  userId: string,
  productId: string,
  variantId?: string | null,
): Promise<void> {
  await db
    .delete(storeBackInStockAlerts)
    .where(
      and(
        eq(storeBackInStockAlerts.userId, userId),
        eq(storeBackInStockAlerts.productId, productId),
        variantId
          ? eq(storeBackInStockAlerts.variantId, variantId)
          : isNull(storeBackInStockAlerts.variantId),
      ),
    );
}

/** Check whether the user has an active (non-notified) alert. */
export async function isSubscribed(
  userId: string,
  productId: string,
  variantId?: string | null,
): Promise<boolean> {
  const [row] = await db
    .select({ id: storeBackInStockAlerts.id })
    .from(storeBackInStockAlerts)
    .where(
      and(
        eq(storeBackInStockAlerts.userId, userId),
        eq(storeBackInStockAlerts.productId, productId),
        variantId
          ? eq(storeBackInStockAlerts.variantId, variantId)
          : isNull(storeBackInStockAlerts.variantId),
        isNull(storeBackInStockAlerts.notifiedAt),
      ),
    )
    .limit(1);

  return !!row;
}

// ---------------------------------------------------------------------------
// Notify
// ---------------------------------------------------------------------------

const BATCH_SIZE = 50;

/**
 * Notify all subscribers that a product (or variant) is back in stock.
 * Sends in-app notification + enqueues a template email for each subscriber.
 * Processes in batches of 50 to avoid overwhelming the notification system.
 */
export async function notifySubscribers(
  productId: string,
  variantId?: string | null,
): Promise<{ notified: number }> {
  const { getStoreDeps } = await import('@/core-store/deps');
  const deps = getStoreDeps();

  // Fetch product name for notifications
  const [product] = await db
    .select({ name: storeProducts.name })
    .from(storeProducts)
    .where(eq(storeProducts.id, productId))
    .limit(1);

  if (!product) {
    logger.warn('Product not found for back-in-stock notification', { productId });
    return { notified: 0 };
  }

  let totalNotified = 0;
  let hasMore = true;

  while (hasMore) {
    const alerts = await db
      .select({
        id: storeBackInStockAlerts.id,
        userId: storeBackInStockAlerts.userId,
      })
      .from(storeBackInStockAlerts)
      .where(
        and(
          eq(storeBackInStockAlerts.productId, productId),
          variantId
            ? eq(storeBackInStockAlerts.variantId, variantId)
            : isNull(storeBackInStockAlerts.variantId),
          isNull(storeBackInStockAlerts.notifiedAt),
        ),
      )
      .limit(BATCH_SIZE);

    if (alerts.length === 0) {
      hasMore = false;
      break;
    }

    for (const alert of alerts) {
      try {
        // Send in-app notification
        deps.sendNotification({
          userId: alert.userId,
          title: 'Back in stock',
          body: `${product.name} is back in stock!`,
          actionUrl: `/store/${productId}`,
        });

        // Get user email for template email
        const [alertUser] = await db
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, alert.userId))
          .limit(1);

        if (alertUser?.email) {
          await deps.enqueueTemplateEmail(alertUser.email, 'back-in-stock', {
            productName: product.name,
            productId,
            variantId: variantId ?? null,
          });
        }

        // Mark as notified
        await db
          .update(storeBackInStockAlerts)
          .set({ notifiedAt: sql`now()` })
          .where(eq(storeBackInStockAlerts.id, alert.id));

        totalNotified++;
      } catch (error) {
        logger.error('Failed to notify subscriber', {
          alertId: alert.id,
          userId: alert.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (alerts.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  if (totalNotified > 0) {
    logger.info('Back-in-stock notifications sent', {
      productId,
      variantId: variantId ?? null,
      notified: totalNotified,
    });
  }

  return { notified: totalNotified };
}
