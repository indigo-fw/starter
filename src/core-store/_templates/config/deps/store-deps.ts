/**
 * Wire core-store module dependencies to project implementations.
 * Imported as a side-effect in server.ts.
 */
import { eq } from 'drizzle-orm';
import { setStoreDeps } from '@/core-store/deps';
import { getProvider } from '@/core-payments/lib/factory';
import { billingProfiles } from '@/core-payments/schema/billing-profile';
import { sendNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { enqueueTemplateEmail } from '@/core/lib/email';
import { db } from '@/server/db';

setStoreDeps({
  async resolveOrgId(activeOrgId, userId) {
    // Simple fallback: use the resolveOrgId from your subscriptions or payments deps.
    // If you don't have core-subscriptions, implement org resolution directly here.
    const { getPaymentsDeps } = await import('@/core-payments/deps');
    return getPaymentsDeps().resolveOrgId(activeOrgId, userId);
  },

  async getBillingProfile(organizationId) {
    const [profile] = await db
      .select({
        legalName: billingProfiles.legalName,
        companyRegistrationId: billingProfiles.companyRegistrationId,
        vatId: billingProfiles.vatId,
        taxExempt: billingProfiles.taxExempt,
        invoiceEmail: billingProfiles.invoiceEmail,
        phone: billingProfiles.phone,
      })
      .from(billingProfiles)
      .where(eq(billingProfiles.organizationId, organizationId))
      .limit(1);

    return profile ?? null;
  },

  async createPaymentCheckout({ orderId, orderNumber, totalCents, currency, customerEmail, providerId, metadata }) {
    const provider = await getProvider(providerId);
    if (!provider) throw new Error(`Payment provider "${providerId}" not available`);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    const result = await provider.createCheckout({
      mode: 'payment',
      finalPriceCents: totalCents,
      currency,
      productName: `Order ${orderNumber}`,
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
