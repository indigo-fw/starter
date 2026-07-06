/**
 * Wire core-store module dependencies to project implementations.
 * Imported as a side-effect in server.ts.
 */
import { eq } from 'drizzle-orm';
import { setStoreDeps } from '@/core-store/deps';
import { getProvider } from '@/core-payments/lib/factory';
import { registerPaymentWebhookHandler } from '@/core-payments/lib/webhook-registry';
import { billingProfiles } from '@/core-payments/schema/billing-profile';
import { sendNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { enqueueTemplateEmail } from '@/core/lib/email';
import { updateOrderStatus, deductOrderInventory } from '@/core-store/lib/order-service';
import { resolveOrgId } from '@/server/lib/resolve-org';
// app-url-runtime, not app-url: this file loads Bun-direct via serverInit,
// where the 'server-only' guard in app-url.ts would throw (see CLAUDE.md).
import { getServerAppUrl } from '@/lib/app-url-runtime';
import { db } from '@/server/db';
import { createLogger } from '@/core/lib/infra/logger';

// Project totals collectors (member discount etc.) — side-effect registration
import '@/config/store-pricing';

const logger = createLogger('store-deps');

// Route one-time 'store_order' payments from provider webhooks to the store
registerPaymentWebhookHandler('store_order', async ({ event, providerId, eventId, metadata }) => {
  if (!metadata.orderId) {
    logger.error('store_order webhook missing orderId metadata', { providerId, eventId });
    return { skipped: true };
  }
  const { handleStorePaymentEvent } = await import('@/core-store/lib/webhook-handler');
  return handleStorePaymentEvent({
    orderId: metadata.orderId,
    eventType: event.type,
    eventId,
    providerId,
    transactionId: (event.providerData as Record<string, unknown> | undefined)?.transactionId as string | undefined,
  });
});

setStoreDeps({
  resolveOrgId,

  async getBillingProfile(organizationId) {
    const [profile] = await db
      .select({
        legalName: billingProfiles.legalName,
        companyRegistrationId: billingProfiles.companyRegistrationId,
        vatId: billingProfiles.vatId,
        taxExempt: billingProfiles.taxExempt,
        invoiceEmail: billingProfiles.invoiceEmail,
        phone: billingProfiles.phone,
        address1: billingProfiles.address1,
        address2: billingProfiles.address2,
        city: billingProfiles.city,
        state: billingProfiles.state,
        postalCode: billingProfiles.postalCode,
        country: billingProfiles.country,
      })
      .from(billingProfiles)
      .where(eq(billingProfiles.organizationId, organizationId))
      .limit(1);

    return profile ?? null;
  },

  async createPaymentCheckout({ orderId, orderNumber, totalCents, currency, customerEmail, providerId, metadata, successUrl }) {
    const appUrl = getServerAppUrl();
    const defaultSuccessUrl = successUrl ?? `${appUrl}/account/orders/${orderId}?success=1`;
    const provider = await getProvider(providerId);

    if (!provider) {
      // Dev mode fallback: skip payment, mark order as processing immediately
      logger.warn('No payment provider configured — using dev mode (order auto-confirmed)', { orderId, providerId });
      await updateOrderStatus(orderId, 'processing', 'system', 'Dev mode: payment skipped (no provider configured)');
      await deductOrderInventory(orderId);
      return defaultSuccessUrl;
    }

    const result = await provider.createCheckout({
      mode: 'payment',
      finalPriceCents: totalCents,
      currency,
      productName: `Order ${orderNumber}`,
      successUrl: defaultSuccessUrl,
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

  async createSubscriptionCheckout({ planId, organizationId, customerEmail, providerId }) {
    const appUrl = getServerAppUrl();

    // Dynamic import — core-subscriptions is optional
    const { getSubscriptionsDeps } = await import('@/core-subscriptions/deps');
    const subDeps = getSubscriptionsDeps();

    const provider = await subDeps.getProvider?.(providerId);
    if (!provider) {
      throw new Error(`Payment provider "${providerId}" is not available for subscription checkout`);
    }

    const result = await provider.createCheckout({
      organizationId,
      planId,
      interval: 'monthly',
      successUrl: `${appUrl}/dashboard/settings/billing?success=true`,
      cancelUrl: `${appUrl}/cart?cancelled=1`,
      customerEmail,
      metadata: { organizationId, source: 'store' },
    });

    return result.url;
  },
});
