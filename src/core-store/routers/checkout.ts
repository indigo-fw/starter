import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { storeCarts, storeAddresses } from '@/core-store/schema/orders';
import { getCartWithItems } from '@/core-store/lib/cart-service';
import { getShippingOptions } from '@/core-store/lib/shipping-service';
import { createOrder, assignInvoiceNumber } from '@/core-store/lib/order-service';
import { recordDiscountUsage } from '@/core-store/lib/discount-service';
import { calculateTotalsPipeline } from '@/core-store/lib/totals-pipeline';
import { getStoreDeps } from '@/core-store/deps';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-checkout');

const addressSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  company: z.string().max(255).optional(),
  address1: z.string().min(1).max(255),
  address2: z.string().max(255).optional(),
  city: z.string().min(1).max(100),
  state: z.string().max(100).optional(),
  postalCode: z.string().min(1).max(20),
  country: z.string().length(2),
  phone: z.string().max(30).optional(),
});

export const storeCheckoutRouter = createTRPCRouter({
  /** Get available shipping options for the cart */
  getShippingOptions: protectedProcedure
    .input(z.object({
      country: z.string().length(2),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [cart] = await ctx.db
        .select({ id: storeCarts.id })
        .from(storeCarts)
        .where(eq(storeCarts.userId, userId))
        .limit(1);

      if (!cart) return [];

      const cartData = await getCartWithItems(cart.id);
      if (!cartData || cartData.items.length === 0) return [];

      return getShippingOptions(input.country, cartData.subtotalCents);
    }),

  /** Calculate order totals (preview before payment) */
  calculateTotals: protectedProcedure
    .input(z.object({
      country: z.string().length(2),
      shippingRateId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const deps = getStoreDeps();
      const userId = ctx.session.user.id;

      const [cart] = await ctx.db
        .select({ id: storeCarts.id })
        .from(storeCarts)
        .where(eq(storeCarts.userId, userId))
        .limit(1);

      if (!cart) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cart is empty' });

      const cartData = await getCartWithItems(cart.id);
      if (!cartData || cartData.items.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cart is empty' });
      }

      // Resolve org + billing profile for VAT ID
      const orgId = await deps.resolveOrgId(
        ctx.activeOrganizationId,
        userId,
      );
      const billingProfile = await deps.getBillingProfile(orgId);

      const totals = await calculateTotalsPipeline({
        cart: cartData,
        country: input.country,
        shippingRateId: input.shippingRateId,
        vatId: billingProfile?.vatId ?? undefined,
      });

      return totals;
    }),

  /** Place order — creates order, processes payment, clears cart */
  placeOrder: protectedProcedure
    .input(z.object({
      // Address: either select from address book OR provide inline
      shippingAddressId: z.string().uuid().optional(),
      shippingAddress: addressSchema.optional(),
      shippingRateId: z.string().uuid().optional(),
      paymentProviderId: z.string().max(50).default('stripe'),
      discountCode: z.string().max(50).optional(),
      customerNote: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const deps = getStoreDeps();
      const userId = ctx.session.user.id;

      // ── Resolve organization ──────────────────────────────────────────
      const orgId = await deps.resolveOrgId(
        ctx.activeOrganizationId,
        userId,
      );

      // ── Fetch billing profile (includes billing address) ────────────
      const billingProfile = await deps.getBillingProfile(orgId);
      if (!billingProfile) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Billing profile not set up. Please complete your billing details before placing an order.',
        });
      }
      if (!billingProfile.address1 || !billingProfile.city || !billingProfile.postalCode || !billingProfile.country) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Billing address incomplete. Please add your billing address in account settings.',
        });
      }

      // ── Resolve shipping address (from ID or inline) ──────────────────
      let shippingAddress: Record<string, unknown>;
      if (input.shippingAddressId) {
        const [addr] = await ctx.db
          .select()
          .from(storeAddresses)
          .where(eq(storeAddresses.id, input.shippingAddressId))
          .limit(1);
        if (!addr || addr.organizationId !== orgId) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Shipping address not found' });
        }
        shippingAddress = addressToSnapshot(addr);
      } else if (input.shippingAddress) {
        shippingAddress = input.shippingAddress;
      } else {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Shipping address required (provide shippingAddressId or shippingAddress)' });
      }

      // ── Get cart ──────────────────────────────────────────────────────
      const [cart] = await ctx.db
        .select({ id: storeCarts.id })
        .from(storeCarts)
        .where(eq(storeCarts.userId, userId))
        .limit(1);

      if (!cart) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cart is empty' });

      const cartData = await getCartWithItems(cart.id);
      if (!cartData || cartData.items.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cart is empty' });
      }

      // Check all items in stock
      const outOfStock = cartData.items.filter((i) => !i.inStock);
      if (outOfStock.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Out of stock: ${outOfStock.map((i) => i.productName).join(', ')}`,
        });
      }

      // ── Subscription product handling ─────────────────────────────────
      const subscriptionItems = cartData.items.filter((i) => i.productType === 'subscription');

      if (subscriptionItems.length > 0) {
        const nonSubItems = cartData.items.filter((i) => i.productType !== 'subscription');
        if (nonSubItems.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Subscription products cannot be mixed with other product types in the same order',
          });
        }

        if (subscriptionItems.length > 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Only one subscription product can be purchased at a time',
          });
        }

        const subItem = subscriptionItems[0]!;

        if (!subItem.subscriptionPlanId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Subscription product is missing a plan ID configuration',
          });
        }

        if (!deps.createSubscriptionCheckout) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Subscription billing is not configured',
          });
        }

        const checkoutUrl = await deps.createSubscriptionCheckout({
          planId: subItem.subscriptionPlanId,
          organizationId: orgId,
          customerEmail: ctx.session.user.email,
          providerId: input.paymentProviderId,
        });

        // Clear cart — subscription lifecycle handled by billing module
        await ctx.db.delete(storeCarts).where(eq(storeCarts.id, cart.id));

        logger.info('Subscription checkout created from store', {
          planId: subItem.subscriptionPlanId,
          productId: subItem.productId,
        });

        return {
          type: 'subscription' as const,
          orderId: null,
          orderNumber: null,
          invoiceNumber: null,
          checkoutUrl,
        };
      }

      // ── Regular (non-subscription) checkout ───────────────────────────
      const country = (shippingAddress as { country: string }).country;

      // Run totals pipeline (subtotal → discount → shipping → tax)
      const totals = await calculateTotalsPipeline({
        cart: cartData,
        country,
        shippingRateId: input.shippingRateId,
        vatId: billingProfile.vatId ?? undefined,
        extensions: { discountCode: input.discountCode, userId },
      });

      const shippingMethod = totals.shippingOption
        ? `${totals.shippingOption.zoneName} - ${totals.shippingOption.name}`
        : undefined;

      // Create order
      const { orderId, orderNumber } = await createOrder({
        organizationId: orgId,
        placedByUserId: userId,
        cart: cartData,
        shippingAddress,
        billingProfile,
        shippingMethod,
        shippingCents: totals.shippingCents,
        taxCents: totals.taxCents,
        taxDetails: totals.taxDetails!,
        discountCents: totals.discountCents,
        discountCode: input.discountCode,
        customerNote: input.customerNote,
        paymentProviderId: input.paymentProviderId,
        adjustments: totals.adjustments,
      });

      // Generate invoice number (EU compliance)
      const invoiceNumber = await assignInvoiceNumber(orderId);

      // Record discount usage (if any)
      if (totals.discountResult) {
        await recordDiscountUsage({
          discountCodeId: totals.discountResult.discountId,
          userId,
          orderId,
        });
      }

      // Create payment checkout session via core-billing provider
      const checkoutUrl = await deps.createPaymentCheckout({
        orderId,
        orderNumber,
        totalCents: totals.totalCents,
        currency: cartData.currency,
        customerEmail: ctx.session.user.email,
        providerId: input.paymentProviderId,
        metadata: { orderId, orderNumber, invoiceNumber },
      });

      // Clear cart after order creation
      await ctx.db.delete(storeCarts).where(eq(storeCarts.id, cart.id));

      logger.info('Order placed', { orderId, orderNumber, totalCents: totals.totalCents, organizationId: orgId });

      return { type: 'order' as const, orderId, orderNumber, invoiceNumber, checkoutUrl };
    }),
});

/** Convert a storeAddresses row to a JSONB snapshot for the order. */
function addressToSnapshot(addr: {
  firstName: string;
  lastName: string;
  company: string | null;
  address1: string;
  address2: string | null;
  city: string;
  state: string | null;
  postalCode: string;
  country: string;
  phone: string | null;
}): Record<string, unknown> {
  return {
    firstName: addr.firstName,
    lastName: addr.lastName,
    company: addr.company,
    address1: addr.address1,
    address2: addr.address2,
    city: addr.city,
    state: addr.state,
    postalCode: addr.postalCode,
    country: addr.country,
    phone: addr.phone,
  };
}
