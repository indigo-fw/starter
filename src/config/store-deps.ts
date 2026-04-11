/**
 * Wire core-store module dependencies to project implementations.
 * Imported as a side-effect in server.ts.
 */
import { setStoreDeps } from '@/core-store/deps';
import { getProvider } from '@/core-payments/lib/factory';
import { sendNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { enqueueTemplateEmail } from '@/core/lib/email';
import { updateOrderStatus } from '@/core-store/lib/order-service';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-deps');

setStoreDeps({
  async createPaymentCheckout({ orderId, orderNumber: _orderNumber, totalCents: _totalCents, currency: _currency, customerEmail, providerId, metadata }) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const provider = await getProvider(providerId);

    if (!provider) {
      // Dev mode fallback: skip payment, mark order as processing immediately
      logger.warn('No payment provider configured — using dev mode (order auto-confirmed)', { orderId, providerId });
      await updateOrderStatus(orderId, 'processing', 'system', 'Dev mode: payment skipped (no provider configured)');
      return `${appUrl}/account/orders/${orderId}?success=1`;
    }

    const result = await provider.createCheckout({
      organizationId: '', // one-time payment, no org needed
      planId: '',
      interval: 'monthly', // not applicable for one-time
      successUrl: `${appUrl}/account/orders/${orderId}?success=1`,
      cancelUrl: `${appUrl}/cart?cancelled=1`,
      customerEmail,
      metadata: { ...metadata, type: 'store_order' },
    });

    return result.url;
  },

  sendNotification({ userId, title, body, actionUrl }) {
    sendNotification({
      userId,
      title,
      body,
      type: NotificationType.INFO,
      category: NotificationCategory.SYSTEM,
      actionUrl,
    });
  },

  enqueueTemplateEmail(to, template, data) {
    return enqueueTemplateEmail(to, template, data as Record<string, string>);
  },
});
