import { and, eq, lt, sql, exists, notExists } from 'drizzle-orm';
import { db } from '@/server/db';
import { storeOrders, storeOrderItems } from '@/core-store/schema/orders';
import { storeReviews } from '@/core-store/schema/reviews';
import { user } from '@/server/db/schema/auth';
import { getStoreDeps } from '@/core-store/deps';
import { registerMaintenanceTask } from '@/core/lib/infra/maintenance';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-review-requests');

/** Days after delivery before sending review request */
const REVIEW_REQUEST_DELAY_DAYS = 7;

/** Max review requests to send per maintenance run */
const BATCH_LIMIT = 50;

/**
 * Check if a review request was already sent for this order by inspecting
 * the order's metadata JSONB column.
 */
function hasReviewRequestFlag(metadata: unknown): boolean {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return (metadata as Record<string, unknown>).reviewRequestSent === true;
  }
  return false;
}

/**
 * Find delivered orders eligible for review requests and send reminder emails.
 *
 * Eligible orders:
 * - status = 'delivered'
 * - deliveredAt is 7+ days ago
 * - metadata does NOT have reviewRequestSent: true
 * - The user has not already reviewed any product from the order
 */
export async function sendReviewRequests(): Promise<{ sent: number }> {
  const cutoff = new Date(
    Date.now() - REVIEW_REQUEST_DELAY_DAYS * 24 * 60 * 60 * 1000,
  );

  let sentCount = 0;

  try {
    const orders = await db
      .select({
        id: storeOrders.id,
        orderNumber: storeOrders.orderNumber,
        placedByUserId: storeOrders.placedByUserId,
        metadata: storeOrders.metadata,
      })
      .from(storeOrders)
      .where(
        and(
          eq(storeOrders.status, 'delivered'),
          lt(storeOrders.deliveredAt, cutoff),
        ),
      )
      .limit(BATCH_LIMIT * 2); // Over-fetch to account for skips

    const deps = getStoreDeps();

    for (const order of orders) {
      if (sentCount >= BATCH_LIMIT) break;

      // Skip guest orders (no userId to notify)
      if (!order.placedByUserId) continue;

      // Skip if already sent
      if (hasReviewRequestFlag(order.metadata)) continue;

      // Check if user already reviewed any product from this order
      const [hasReview] = await db
        .select({ one: sql<number>`1` })
        .from(storeReviews)
        .where(
          and(
            eq(storeReviews.userId, order.placedByUserId),
            exists(
              db
                .select({ one: sql`1` })
                .from(storeOrderItems)
                .where(
                  and(
                    eq(storeOrderItems.orderId, order.id),
                    eq(storeOrderItems.productId, storeReviews.productId),
                  ),
                ),
            ),
          ),
        )
        .limit(1);

      if (hasReview) {
        // Mark as sent to avoid re-checking every run
        await db
          .update(storeOrders)
          .set({
            metadata: sql`COALESCE(${storeOrders.metadata}, '{}'::jsonb) || '{"reviewRequestSent": true}'::jsonb`,
          })
          .where(eq(storeOrders.id, order.id));
        continue;
      }

      // Get user email
      const [orderUser] = await db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, order.placedByUserId))
        .limit(1);

      if (!orderUser?.email) continue;

      // Get order items for the email template
      const items = await db
        .select({
          productName: storeOrderItems.productName,
          productId: storeOrderItems.productId,
        })
        .from(storeOrderItems)
        .where(eq(storeOrderItems.orderId, order.id))
        .limit(10);

      const productNames = items
        .map((item) => item.productName)
        .join(', ');

      await deps.enqueueTemplateEmail(orderUser.email, 'review-request', {
        orderNumber: order.orderNumber,
        productNames,
        reviewUrl: `/account/orders/${order.id}`,
      });

      // Mark as sent
      await db
        .update(storeOrders)
        .set({
          metadata: sql`COALESCE(${storeOrders.metadata}, '{}'::jsonb) || '{"reviewRequestSent": true}'::jsonb`,
        })
        .where(eq(storeOrders.id, order.id));

      sentCount++;
    }

    if (sentCount > 0) {
      logger.info('Review request emails sent', { count: sentCount });
    }
  } catch (error) {
    logger.error('Failed to send review requests', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { sent: sentCount };
}

// Register as a maintenance task (runs during scheduled maintenance)
registerMaintenanceTask('sendStoreReviewRequests', async () => {
  await sendReviewRequests();
});
