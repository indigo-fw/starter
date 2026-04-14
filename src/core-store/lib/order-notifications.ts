import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { storeOrders } from '@/core-store/schema/orders';
import { user } from '@/server/db/schema/auth';
import { getStoreDeps } from '@/core-store/deps';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-order-notifications');

interface StatusConfig {
  template: string;
  title: string;
  bodyFn: (orderNumber: string) => string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  processing: {
    template: 'order-processing',
    title: 'Order confirmed',
    bodyFn: (n) => `Order #${n} has been confirmed and is being prepared.`,
  },
  shipped: {
    template: 'order-shipped',
    title: 'Order shipped',
    bodyFn: (n) => `Order #${n} has been shipped and is on its way.`,
  },
  delivered: {
    template: 'order-delivered',
    title: 'Order delivered',
    bodyFn: (n) => `Order #${n} has been delivered. We hope you enjoy it!`,
  },
  cancelled: {
    template: 'order-cancelled',
    title: 'Order cancelled',
    bodyFn: (n) => `Order #${n} has been cancelled.`,
  },
  refunded: {
    template: 'order-refunded',
    title: 'Order refunded',
    bodyFn: (n) => `A refund has been processed for order #${n}.`,
  },
};

/**
 * Format cents into a human-readable currency string.
 */
function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

/**
 * Send appropriate email and in-app notification when order status changes.
 * Called from order-service after status update. Fire-and-forget — errors are
 * logged but never thrown so they don't break the order flow.
 */
export async function sendOrderStatusNotification(
  orderId: string,
  newStatus: string,
): Promise<void> {
  try {
    const config = STATUS_MAP[newStatus];
    if (!config) {
      return; // No notification for this status (e.g. 'pending')
    }

    const [order] = await db
      .select({
        orderNumber: storeOrders.orderNumber,
        placedByUserId: storeOrders.placedByUserId,
        totalCents: storeOrders.totalCents,
        currency: storeOrders.currency,
        trackingNumber: storeOrders.trackingNumber,
        trackingUrl: storeOrders.trackingUrl,
        shippingAddress: storeOrders.shippingAddress,
      })
      .from(storeOrders)
      .where(eq(storeOrders.id, orderId))
      .limit(1);

    if (!order) {
      logger.warn('Order not found for notification', { orderId, newStatus });
      return;
    }

    const [orderUser] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, order.placedByUserId))
      .limit(1);

    if (!orderUser?.email) {
      logger.warn('User email not found for order notification', {
        orderId,
        userId: order.placedByUserId,
      });
      return;
    }

    const deps = getStoreDeps();
    const totalFormatted = formatMoney(order.totalCents, order.currency);
    const accountOrdersUrl = `/account/orders/${orderId}`;

    // Send template email
    await deps.enqueueTemplateEmail(orderUser.email, config.template, {
      orderId,
      orderNumber: order.orderNumber,
      totalFormatted,
      trackingNumber: order.trackingNumber ?? '',
      trackingUrl: order.trackingUrl ?? '',
      accountOrdersUrl,
    });

    // Send in-app notification
    deps.sendNotification({
      userId: order.placedByUserId,
      title: config.title,
      body: config.bodyFn(order.orderNumber),
      actionUrl: accountOrdersUrl,
    });

    logger.info('Order notification sent', {
      orderId,
      status: newStatus,
      template: config.template,
    });
  } catch (error) {
    logger.error('Failed to send order notification', {
      orderId,
      newStatus,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
