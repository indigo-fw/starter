import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { storeCarts } from '@/core-store/schema/orders';
import { getCartWithItems } from '@/core-store/lib/cart-service';
import { calculateOrderTax } from '@/core-store/lib/tax-service';
import { getShippingOptions } from '@/core-store/lib/shipping-service';
import { createOrder, assignInvoiceNumber, updateOrderStatus } from '@/core-store/lib/order-service';
import { getStoreDeps } from '@/core-store/deps';
import { createLogger } from '@/core/lib/logger';

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
      vatId: z.string().max(50).optional(),
    }))
    .query(async ({ ctx, input }) => {
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

      // Calculate tax
      const taxItems = cartData.items.map((item) => ({
        amountCents: item.totalCents,
        taxClass: 'standard', // TODO: get from product
      }));
      const tax = await calculateOrderTax(taxItems, input.country, input.vatId);

      // Get shipping cost
      let shippingCents = 0;
      if (input.shippingRateId) {
        const options = await getShippingOptions(input.country, cartData.subtotalCents);
        const selected = options.find((o) => o.rateId === input.shippingRateId);
        shippingCents = selected?.rateCents ?? 0;
      }

      const totalCents = cartData.subtotalCents + shippingCents + tax.totalTaxCents;

      return {
        subtotalCents: cartData.subtotalCents,
        shippingCents,
        taxCents: tax.totalTaxCents,
        totalCents,
        itemCount: cartData.itemCount,
        taxDetails: tax,
      };
    }),

  /** Place order — creates order, processes payment, clears cart */
  placeOrder: protectedProcedure
    .input(z.object({
      shippingAddress: addressSchema,
      billingAddress: addressSchema.optional(),
      shippingRateId: z.string().uuid().optional(),
      paymentProviderId: z.string().max(50).default('stripe'),
      vatId: z.string().max(50).optional(),
      customerNote: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const deps = getStoreDeps();
      const userId = ctx.session.user.id;

      // Get cart
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

      // Calculate totals
      const billingAddress = input.billingAddress ?? input.shippingAddress;
      const country = input.shippingAddress.country;

      const taxItems = cartData.items.map((item) => ({
        amountCents: item.totalCents,
        taxClass: 'standard',
      }));
      const taxResult = await calculateOrderTax(taxItems, country, input.vatId);

      let shippingCents = 0;
      let shippingMethod: string | undefined;
      if (input.shippingRateId) {
        const options = await getShippingOptions(country, cartData.subtotalCents);
        const selected = options.find((o) => o.rateId === input.shippingRateId);
        if (selected) {
          shippingCents = selected.rateCents;
          shippingMethod = `${selected.zoneName} - ${selected.name}`;
        }
      }

      // Create order
      const { orderId, orderNumber } = await createOrder({
        userId,
        cart: cartData,
        shippingAddress: input.shippingAddress,
        billingAddress,
        shippingMethod,
        shippingCents,
        taxCents: taxResult.totalTaxCents,
        taxDetails: taxResult,
        customerNote: input.customerNote,
        paymentProviderId: input.paymentProviderId,
      });

      // Generate invoice number (EU compliance)
      const invoiceNumber = await assignInvoiceNumber(orderId);

      // Create payment checkout session via core-billing provider
      const totalCents = cartData.subtotalCents + shippingCents + taxResult.totalTaxCents;
      const checkoutUrl = await deps.createPaymentCheckout({
        orderId,
        orderNumber,
        totalCents,
        currency: cartData.currency,
        customerEmail: ctx.session.user.email,
        providerId: input.paymentProviderId,
        metadata: { orderId, orderNumber, invoiceNumber },
      });

      // Clear cart after order creation
      await ctx.db.delete(storeCarts).where(eq(storeCarts.id, cart.id));

      logger.info('Order placed', { orderId, orderNumber, totalCents });

      return { orderId, orderNumber, invoiceNumber, checkoutUrl };
    }),
});
