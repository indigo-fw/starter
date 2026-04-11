/**
 * Wire core-store module dependencies to project implementations.
 * Imported as a side-effect in server.ts.
 */
import { setStoreDeps } from '@/core-store/deps';
import { getProvider } from '@/core-payments/lib/factory';
import { sendNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { enqueueTemplateEmail } from '@/core/lib/email';

setStoreDeps({
  async createPaymentCheckout({ orderId, orderNumber: _orderNumber, totalCents: _totalCents, currency: _currency, customerEmail, providerId, metadata }) {
    const provider = await getProvider(providerId);
    if (!provider) throw new Error(`Payment provider "${providerId}" not available`);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return enqueueTemplateEmail(to, template, data as Record<string, string>);
  },
});
