import type Stripe from 'stripe';
import type {
  PaymentProvider, CheckoutParams, CheckoutResult, WebhookEvent,
  AuthorizeParams, AuthorizeResult, CaptureParams, CaptureResult,
  VoidResult, RefundResult, StoredPaymentMethod, SetupIntentResult,
  PaymentMethodType,
} from '@/core-payments/types/payment';
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
    capabilities: {
      authCapture: true,
      partialCapture: true,
      void: true,
      storedPaymentMethods: true,
      partialRefund: true,
    },
  };

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const stripe = requireStripe();

    // ── One-time payment mode ───────────────────────────────────────────
    if (params.mode === 'payment') {
      const amount = params.finalPriceCents;
      if (!amount || amount <= 0) throw new Error('finalPriceCents is required for one-time payments');

      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: params.currency ?? 'usd',
            unit_amount: amount,
            product_data: { name: params.productName ?? 'Order' },
          },
          quantity: 1,
        }],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: { ...params.metadata },
      };

      if (params.customerEmail) {
        sessionParams.customer_email = params.customerEmail;
      }

      const session = await stripe.checkout.sessions.create(sessionParams);
      return { url: session.url!, providerId: 'stripe' };
    }

    // ── Subscription mode (default) ─────────────────────────────────────
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
          // One-time payment or store order — preserve metadata for routing
          return {
            type: 'payment.completed',
            providerData: { ...baseProviderData, metadata: session.metadata },
          };
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

  // ─── Auth / Capture / Void ───────────────────────────────────────────────

  async authorize(params: AuthorizeParams): Promise<AuthorizeResult> {
    const stripe = requireStripe();
    const pi = await stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: params.currency,
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      capture_method: 'manual',
      confirm: !!params.paymentMethodId,
      off_session: params.offSession,
      metadata: params.metadata,
    });
    return {
      providerTxId: pi.id,
      status: pi.status === 'requires_capture' ? 'authorized'
            : pi.status === 'requires_action' ? 'requires_action'
            : 'failed',
      amountCents: pi.amount,
      clientSecret: pi.client_secret ?? undefined,
    };
  }

  async capture(params: CaptureParams): Promise<CaptureResult> {
    const stripe = requireStripe();
    const pi = await stripe.paymentIntents.capture(params.providerTxId, {
      ...(params.amountCents !== undefined && { amount_to_capture: params.amountCents }),
    });
    return {
      providerTxId: pi.id,
      status: pi.status === 'succeeded' ? 'captured' : 'failed',
      capturedAmountCents: pi.amount_received,
    };
  }

  async void(providerTxId: string): Promise<VoidResult> {
    const stripe = requireStripe();
    const pi = await stripe.paymentIntents.cancel(providerTxId);
    return {
      providerTxId: pi.id,
      status: pi.status === 'canceled' ? 'voided' : 'failed',
    };
  }

  // ─── Refund ─────────────────────────────────────────────────────────────

  async refund(providerTxId: string, amountCents?: number): Promise<RefundResult> {
    const stripe = requireStripe();
    try {
      const refund = await stripe.refunds.create({
        payment_intent: providerTxId,
        ...(amountCents !== undefined && { amount: amountCents }),
      });
      return {
        refundId: refund.id,
        providerTxId,
        status: refund.status === 'succeeded' ? 'succeeded' : 'pending',
        amountCents: refund.amount,
      };
    } catch {
      return { refundId: '', providerTxId, status: 'failed', amountCents: amountCents ?? 0 };
    }
  }

  // ─── Stored Payment Methods ─────────────────────────────────────────────

  async listPaymentMethods(customerId: string): Promise<StoredPaymentMethod[]> {
    const stripe = requireStripe();
    const methods = await stripe.customers.listPaymentMethods(customerId, { type: 'card' });
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
    const defaultPmId = typeof customer.invoice_settings?.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : (customer.invoice_settings?.default_payment_method as { id: string } | null)?.id;

    return methods.data.map((pm) => ({
      id: pm.id,
      type: 'card' as PaymentMethodType,
      last4: pm.card?.last4,
      brand: pm.card?.brand,
      expiryMonth: pm.card?.exp_month,
      expiryYear: pm.card?.exp_year,
      isDefault: pm.id === defaultPmId,
    }));
  }

  async createSetupIntent(customerId: string): Promise<SetupIntentResult> {
    const stripe = requireStripe();
    const si = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
    return {
      clientSecret: si.client_secret!,
      setupIntentId: si.id,
    };
  }

  async deletePaymentMethod(paymentMethodId: string): Promise<boolean> {
    const stripe = requireStripe();
    try {
      await stripe.paymentMethods.detach(paymentMethodId);
      return true;
    } catch {
      return false;
    }
  }
}
