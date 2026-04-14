/**
 * Reusable subscription webhook handler.
 *
 * Extracted from the stripe/nowpayments webhook routes so the project-layer
 * route files only need a dynamic import, not static deps on core-subscriptions.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { user } from '@/server/db/schema';
import { member } from '@/server/db/schema/organization';
import type { WebhookEvent } from '@/core-payments/types/payment';
import { activateSubscription, updateSubscription, cancelSubscription, getOrgByProviderSubscription } from './subscription-service';
import { finalizeUsage } from './discount-service';
import { getSubscriptionsDeps } from '@/core-subscriptions/deps';
import { logAudit } from '@/core/lib/infra/audit';
import { invalidateStats } from '@/core/lib/infra/stats-cache';
import { runHook } from '@/core/lib/module/module-hooks';
import { tagSubscriber } from '@/core/lib/email-list/index';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('subscription-webhook-handler');

const BILLING_SETTINGS_URL = '/dashboard/settings/billing';

export interface SubscriptionWebhookParams {
  event: WebhookEvent;
  providerId: string;
}

/**
 * Handle a subscription-related webhook event.
 * Called from both the Stripe and NOWPayments webhook routes.
 */
export async function handleSubscriptionWebhookEvent({ event, providerId }: SubscriptionWebhookParams): Promise<void> {
  const deps = getSubscriptionsDeps();
  const providerData = event.providerData as Record<string, unknown> | undefined;

  switch (event.type) {
    case 'subscription.activated': {
      if (!event.organizationId) break;

      // Infer interval from provider price ID
      const activatedPlan = event.providerPriceId
        ? deps.getPlanByProviderPriceId(providerId, event.providerPriceId)
        : null;
      const inferredInterval: 'monthly' | 'yearly' =
        activatedPlan && event.providerPriceId &&
        activatedPlan.providerPrices[providerId]?.yearly === event.providerPriceId
          ? 'yearly' : 'monthly';

      await activateSubscription({
        organizationId: event.organizationId,
        planId: event.planId ?? 'free',
        providerId,
        interval: inferredInterval,
        providerCustomerId: event.providerCustomerId ?? '',
        providerSubscriptionId: event.providerSubscriptionId,
        providerPriceId: event.providerPriceId,
        status: event.status,
        periodStart: event.periodStart,
        periodEnd: event.periodEnd,
      });

      // Finalize discount usage if one was applied at checkout
      const discountUsageId = providerData?.discountUsageId as string | undefined;
      if (discountUsageId) {
        await finalizeUsage(discountUsageId, event.providerSubscriptionId ?? '');
      }

      logAudit({
        db,
        userId: 'system',
        action: 'subscription.created',
        entityType: 'subscription',
        entityId: event.providerSubscriptionId ?? 'unknown',
        metadata: { orgId: event.organizationId, planId: event.planId, provider: providerId },
      });

      deps.sendOrgNotification(event.organizationId, {
        title: 'Subscription activated',
        body: `Your subscription to the ${event.planId ?? 'selected'} plan is now active.`,
        type: NotificationType.SUCCESS,
        category: NotificationCategory.BILLING,
        actionUrl: BILLING_SETTINGS_URL,
      });

      // Record affiliate conversion (via module hooks registry)
      const checkoutUserId = providerData?.userId as string | undefined;
      if (checkoutUserId) {
        const planObj = event.providerPriceId
          ? deps.getPlanByProviderPriceId(providerId, event.providerPriceId)
          : null;
        const amountCents = providerData?.amountCents as number | undefined
          ?? (planObj ? (inferredInterval === 'yearly' ? planObj.priceYearly : planObj.priceMonthly) : 0);
        runHook('payment.conversion', checkoutUserId, event.providerSubscriptionId ?? 'unknown', amountCents);
      }

      // Tag subscriber in email list
      if (checkoutUserId) {
        const [tagUser] = await db
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, checkoutUserId))
          .limit(1);
        if (tagUser?.email) {
          tagSubscriber(tagUser.email, [event.planId ?? 'subscriber']);
        }
      }

      invalidateStats('billing');
      break;
    }

    case 'subscription.updated': {
      if (!event.providerSubscriptionId) break;

      await updateSubscription(event.providerSubscriptionId, {
        planId: event.planId,
        status: event.status,
        providerPriceId: event.providerPriceId,
        periodStart: event.periodStart,
        periodEnd: event.periodEnd,
        cancelAtPeriodEnd: event.cancelAtPeriodEnd,
      });

      invalidateStats('billing');
      break;
    }

    case 'subscription.canceled': {
      if (!event.providerSubscriptionId) break;

      const orgId = await getOrgByProviderSubscription(event.providerSubscriptionId);
      await cancelSubscription(event.providerSubscriptionId);

      invalidateStats('billing');

      if (orgId) {
        deps.sendOrgNotification(orgId, {
          title: 'Subscription canceled',
          body: 'Your subscription has been canceled. You have been moved to the free plan.',
          type: NotificationType.WARNING,
          category: NotificationCategory.BILLING,
          actionUrl: BILLING_SETTINGS_URL,
        });

        // Tag org owner as churned
        const [owner] = await db
          .select({ email: user.email })
          .from(member)
          .innerJoin(user, eq(member.userId, user.id))
          .where(eq(member.organizationId, orgId))
          .limit(1);
        if (owner?.email) {
          tagSubscriber(owner.email, ['churned']);
        }
      }
      break;
    }

    case 'payment.failed': {
      // Stripe provides providerSubscriptionId; NOWPayments only provides organizationId
      const failedOrgId = event.providerSubscriptionId
        ? await getOrgByProviderSubscription(event.providerSubscriptionId)
        : event.organizationId;

      if (!failedOrgId) break;

      if (event.providerSubscriptionId) {
        await updateSubscription(event.providerSubscriptionId, {
          status: 'past_due',
        });
        invalidateStats('billing');
      }

      deps.sendOrgNotification(failedOrgId, {
        title: 'Payment failed',
        body: 'Payment failed for your subscription. Please update your payment method to avoid service interruption.',
        type: NotificationType.ERROR,
        category: NotificationCategory.BILLING,
        actionUrl: BILLING_SETTINGS_URL,
      });
      break;
    }

    case 'payment.refunded': {
      if (!event.organizationId) break;

      deps.sendOrgNotification(event.organizationId, {
        title: 'Payment refunded',
        body: 'Your payment has been refunded.',
        type: NotificationType.WARNING,
        category: NotificationCategory.BILLING,
        actionUrl: BILLING_SETTINGS_URL,
      });
      break;
    }

    default:
      logger.info('Unhandled subscription webhook event', { type: event.type, providerId });
  }
}
