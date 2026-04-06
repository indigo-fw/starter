import type Stripe from 'stripe';
import type { PaymentProvider, CheckoutParams, CheckoutResult, WebhookEvent } from '@/core-payments/types/payment';
import { DiscountType } from '@/core-payments/types/payment';
import { getStripe, requireStripe, getOrCreateStripeCustomer } from '@/core-payments/lib/stripe';
import { getPaymentsDeps } from '@/core-payments/deps';

export class StripeProvider implements PaymentProvider {
  config = {
    id: 'stripe',
    name: 'Stripe',
    description: 'Credit card payments via Stripe',
    supportsRecurring: true,
    enabled: !!getStripe(),
    allowedIntervals: ['monthly', 'yearly'] as ('monthly' | 'yearly')[],
  };

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const stripe = requireStripe();
    const customerId = await getOrCreateStripeCustomer(params.organizationId);

    const plan = getPaymentsDeps().getPlan(params.planId);
    if (!plan) throw new Error(`Plan not found: ${params.planId}`);

    const priceId = getPaymentsDeps().getProviderPriceId(plan, 'stripe', params.interval);
    if (!priceId) throw new Error(`No Stripe price for ${params.planId}/${params.interval}`);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      allow_promotion_codes: false, // we use our own discount engine
      metadata: {
        orgId: params.organizationId,
        planId: params.planId,
        ...params.metadata,
      },
    };

    // Apply discount at the Stripe level
    if (params.discount) {
      const coupon = await this.createAdHocCoupon(stripe, params.discount, params.originalPriceCents);
      if (coupon) {
        sessionParams.discounts = [{ coupon: coupon.id }];
      }

      // Trial discounts: override trial period
      if (params.discount.type === DiscountType.TRIAL || params.discount.type === DiscountType.FREE_TRIAL) {
        const trialDays = params.discount.trialDays ?? plan.trialDays;
        if (trialDays && trialDays > 0) {
          sessionParams.subscription_data = {
            trial_period_days: trialDays,
          };
        }
      }
    }

    // Add default trial period if plan has trialDays and no discount-driven trial
    if (!sessionParams.subscription_data?.trial_period_days && plan.trialDays && plan.trialDays > 0) {
      sessionParams.subscription_data = {
        ...sessionParams.subscription_data,
        trial_period_days: plan.trialDays,
      };
    }

    if (params.customerEmail) {
      sessionParams.customer_email = params.customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return {
      url: session.url!,
      providerId: 'stripe',
    };
  }

  async handleWebhook(request: Request): Promise<WebhookEvent> {
    const stripe = requireStripe();
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('Missing Stripe webhook signature or secret');
    }

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    // _eventId is a dedicated key for idempotency — must not collide with Stripe object fields
    const baseProviderData: Record<string, unknown> = {
      _eventId: event.id,
      _eventType: event.type,
    };

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.orgId;
        if (!orgId || !session.subscription) {
          return { type: 'subscription.activated', providerData: baseProviderData };
        }

        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );
        const firstItem = subscription.items.data[0];
        const priceId = firstItem?.price.id;
        const plan = priceId ? getPaymentsDeps().getPlanByProviderPriceId('stripe', priceId) : null;

        return {
          type: 'subscription.activated',
          organizationId: orgId,
          planId: plan?.id ?? 'free',
          status: subscription.status,
          providerSubscriptionId: subscription.id,
          providerCustomerId: session.customer as string,
          providerPriceId: priceId,
          periodStart: firstItem ? new Date(firstItem.current_period_start * 1000) : undefined,
          periodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : undefined,
          providerData: { ...baseProviderData, ...session.metadata },
        };
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const firstItem = subscription.items.data[0];
        const priceId = firstItem?.price.id;
        const plan = priceId ? getPaymentsDeps().getPlanByProviderPriceId('stripe', priceId) : null;

        return {
          type: 'subscription.updated',
          planId: plan?.id ?? 'free',
          status: subscription.status,
          providerSubscriptionId: subscription.id,
          providerPriceId: priceId,
          periodStart: firstItem ? new Date(firstItem.current_period_start * 1000) : undefined,
          periodEnd: firstItem ? new Date(firstItem.current_period_end * 1000) : undefined,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          providerData: baseProviderData,
        };
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        return {
          type: 'subscription.canceled',
          providerSubscriptionId: subscription.id,
          status: 'canceled',
          providerData: baseProviderData,
        };
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        // Extract subscription ID from parent.subscription_details or lines
        const subRef = invoice.parent?.subscription_details?.subscription
          ?? invoice.lines?.data?.[0]?.subscription;
        const subId = subRef
          ? typeof subRef === 'string' ? subRef : (subRef as { id: string }).id
          : undefined;
        return {
          type: 'payment.failed',
          providerSubscriptionId: subId,
          status: 'past_due',
          providerData: baseProviderData,
        };
      }

      default:
        return {
          type: 'subscription.updated',
          providerData: baseProviderData,
        };
    }
  }

  async createPortalSession(orgId: string, returnUrl: string): Promise<string> {
    const stripe = requireStripe();
    const customerId = await getOrCreateStripeCustomer(orgId);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return session.url;
  }

  /**
   * Create a one-time Stripe coupon from our discount definition.
   * Returns null for discount types that don't translate to Stripe coupons (e.g. trial-only).
   */
  private async createAdHocCoupon(
    stripe: Stripe,
    discount: import('@/core-payments/types/payment').DiscountDefinition,
    originalPriceCents?: number,
  ): Promise<Stripe.Coupon | null> {
    switch (discount.type) {
      case DiscountType.PERCENTAGE:
        if (!discount.value) return null;
        return stripe.coupons.create({
          percent_off: discount.value,
          duration: 'once',
        });

      case DiscountType.FIXED_PRICE: {
        // Fixed price = "pay this amount instead". Convert to amount_off.
        if (discount.value === undefined || !originalPriceCents) return null;
        const amountOff = originalPriceCents - discount.value;
        if (amountOff <= 0) return null;
        return stripe.coupons.create({
          amount_off: amountOff,
          currency: 'usd',
          duration: 'once',
        });
      }

      case DiscountType.TRIAL:
        // Trial with reduced price for first period — use amount_off
        if (discount.trialPriceCents !== undefined && originalPriceCents) {
          const amountOff = originalPriceCents - discount.trialPriceCents;
          if (amountOff > 0) {
            return stripe.coupons.create({
              amount_off: amountOff,
              currency: 'usd',
              duration: 'once',
            });
          }
        }
        return null;

      case DiscountType.FREE_TRIAL:
        // Free trial is handled via trial_period_days, no coupon needed
        return null;

      default:
        return null;
    }
  }

  async refund(transactionId: string, amountCents?: number): Promise<boolean> {
    const stripe = requireStripe();
    try {
      await stripe.refunds.create({
        payment_intent: transactionId,
        ...(amountCents !== undefined && { amount: amountCents }),
      });
      return true;
    } catch {
      return false;
    }
  }
}
