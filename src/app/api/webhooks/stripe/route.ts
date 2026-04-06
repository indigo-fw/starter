import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasSubscriptionEvents, user } from '@/server/db/schema';
import { member } from '@/server/db/schema/organization';
import { getProvider } from '@/core-payments/lib/factory';
import {
  activateSubscription,
  updateSubscription,
  cancelSubscription,
  getOrgByProviderSubscription,
} from '@/core-subscriptions/lib/subscription-service';
import { finalizeUsage } from '@/core-subscriptions/lib/discount-service';
import { getPlanByProviderPriceId } from '@/config/plans';
import { logAudit } from '@/core/lib/audit';
import { sendOrgNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { createLogger } from '@/core/lib/logger';
import { adminPanel } from '@/config/routes';
import { invalidateStats } from '@/core/lib/stats-cache';
import { tagSubscriber } from '@/core/lib/email-list/index';

const logger = createLogger('stripe-webhook');

export async function POST(request: Request) {
  const stripeProvider = await getProvider('stripe');
  if (!stripeProvider) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  // Clone request so we can read body twice (once for signature verification in provider)
  const clonedRequest = request.clone();

  let event;
  try {
    event = await stripeProvider.handleWebhook(clonedRequest);
  } catch (err) {
    logger.error('Stripe webhook verification failed', { error: String(err) });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency check via _eventId set by the Stripe provider
  const stripeEventId = (event.providerData as Record<string, unknown>)?._eventId as string | undefined;
  if (!stripeEventId) {
    return NextResponse.json({ error: 'Missing event ID' }, { status: 400 });
  }

  // Atomic idempotency: INSERT or bail if already processed
  try {
    await db.insert(saasSubscriptionEvents).values({
      providerId: 'stripe',
      providerEventId: stripeEventId,
      type: event.type,
      data: event.providerData as Record<string, unknown>,
    });
  } catch (err) {
    // Unique constraint violation = already processed
    if (String(err).includes('unique') || String(err).includes('duplicate')) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw err;
  }

  try {
    switch (event.type) {
      case 'subscription.activated': {
        if (!event.organizationId || !event.providerSubscriptionId) break;

        // Infer interval from provider price ID
        const activatedPlan = event.providerPriceId
          ? getPlanByProviderPriceId('stripe', event.providerPriceId)
          : null;
        const inferredInterval: 'monthly' | 'yearly' =
          activatedPlan && event.providerPriceId &&
          activatedPlan.providerPrices.stripe?.yearly === event.providerPriceId
            ? 'yearly' : 'monthly';

        await activateSubscription({
          organizationId: event.organizationId,
          planId: event.planId ?? 'free',
          providerId: 'stripe',
          interval: inferredInterval,
          providerCustomerId: event.providerCustomerId ?? '',
          providerSubscriptionId: event.providerSubscriptionId,
          providerPriceId: event.providerPriceId,
          status: event.status,
          periodStart: event.periodStart,
          periodEnd: event.periodEnd,
        });

        // Finalize discount usage if one was applied at checkout
        const metadata = event.providerData as Record<string, unknown> | undefined;
        const discountUsageId = metadata?.discountUsageId as string | undefined;
        if (discountUsageId) {
          await finalizeUsage(discountUsageId, event.providerSubscriptionId);
        }

        logAudit({
          db,
          userId: 'system',
          action: 'subscription.created',
          entityType: 'subscription',
          entityId: event.providerSubscriptionId,
          metadata: { orgId: event.organizationId, planId: event.planId },
        });

        sendOrgNotification(event.organizationId, {
          title: 'Subscription activated',
          body: `Your subscription to the ${event.planId ?? 'selected'} plan is now active.`,
          type: NotificationType.SUCCESS,
          category: NotificationCategory.BILLING,
          actionUrl: adminPanel.settingsBilling,
        });

        // Record affiliate conversion if applicable (core-affiliates module optional)
        const checkoutUserId = metadata?.userId as string | undefined;
        if (checkoutUserId) {
          const activatedPlanObj = getPlanByProviderPriceId('stripe', event.providerPriceId ?? '');
          const amountCents = activatedPlanObj
            ? (inferredInterval === 'yearly' ? activatedPlanObj.priceYearly : activatedPlanObj.priceMonthly)
            : 0;
          import('@/core-affiliates/lib/affiliates')
            .then(({ recordConversion }) => recordConversion(checkoutUserId, event.providerSubscriptionId!, amountCents))
            .catch(() => {/* core-affiliates not installed */});
        }

        // Tag subscriber in email list with plan name
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
          sendOrgNotification(orgId, {
            title: 'Subscription canceled',
            body: 'Your subscription has been canceled. You have been moved to the free plan.',
            type: NotificationType.WARNING,
            category: NotificationCategory.BILLING,
            actionUrl: adminPanel.settingsBilling,
          });

          // Tag org owner as churned in email list
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
        if (!event.providerSubscriptionId) break;

        const failedOrgId = await getOrgByProviderSubscription(event.providerSubscriptionId);

        await updateSubscription(event.providerSubscriptionId, {
          status: 'past_due',
        });

        invalidateStats('billing');

        if (failedOrgId) {
          sendOrgNotification(failedOrgId, {
            title: 'Payment failed',
            body: 'Payment failed for your subscription. Please update your payment method to avoid service interruption.',
            type: NotificationType.ERROR,
            category: NotificationCategory.BILLING,
            actionUrl: adminPanel.settingsBilling,
          });
        }
        break;
      }
    }
  } catch (err) {
    logger.error('Error processing Stripe webhook', { error: String(err) });
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
