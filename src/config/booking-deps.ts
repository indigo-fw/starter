/**
 * Wire core-booking module dependencies to project implementations.
 * Imported as a side-effect in server.ts.
 */
import { setBookingDeps } from '@/core-booking/deps';
import { sendNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { enqueueTemplateEmail } from '@/core/lib/email';

setBookingDeps({
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

  // Uncomment to enable paid bookings via core-payments:
  // async createPaymentCheckout({ bookingId, bookingNumber, totalCents, currency, customerEmail, metadata }) {
  //   const { getProvider } = await import('@/core-payments/lib/factory');
  //   const provider = await getProvider('stripe');
  //   if (!provider) throw new Error('Payment provider not available');
  //
  //   const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  //   const result = await provider.createCheckout({
  //     organizationId: '',
  //     planId: '',
  //     interval: 'monthly',
  //     successUrl: `${appUrl}/account/bookings/${bookingId}?success=1`,
  //     cancelUrl: `${appUrl}/booking?cancelled=1`,
  //     customerEmail,
  //     metadata: { ...metadata, type: 'booking_payment' },
  //   });
  //   return result.url;
  // },
});
