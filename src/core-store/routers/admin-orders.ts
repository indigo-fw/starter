import { z } from 'zod';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, sectionProcedure } from '@/server/trpc';
import { storeOrders, storeOrderItems } from '@/core-store/schema/orders';
import { serializeExport } from '@/core/crud/admin-crud';
import { updateOrderStatus, assignInvoiceNumber } from '@/core-store/lib/order-service';
import { getStoreDeps } from '@/core-store/deps';
import { getRefundHandler } from '@/core-store/lib/refund-types';
import { generateInvoiceHtml } from '@/core-store/lib/invoice-template';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-admin-orders');
const storeAdminProcedure = sectionProcedure('settings');

/** Format cents as decimal string (e.g. 1999 -> "19.99") */
function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Safely extract a string field from a JSON address snapshot */
function addressField(address: unknown, ...fields: string[]): string {
  if (!address || typeof address !== 'object') return '';
  const obj = address as Record<string, unknown>;
  return fields.map((f) => (obj[f] ? String(obj[f]) : '')).filter(Boolean).join(', ');
}

/** Format a Date or null to ISO date string */
function fmtDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : '';
}

export const storeAdminOrdersRouter = createTRPCRouter({
  /**
   * Export orders as JSON or TSV with optional date/status filters.
   * Returns serialized data + filename for client-side download.
   */
  exportOrders: storeAdminProcedure
    .input(
      z.object({
        format: z.enum(['json', 'csv']).default('csv'),
        from: z.string().max(10).optional(),
        to: z.string().max(10).optional(),
        status: z
          .enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'])
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const conditions = [];
      if (input.status) conditions.push(eq(storeOrders.status, input.status));
      if (input.from) conditions.push(gte(storeOrders.createdAt, new Date(input.from)));
      if (input.to) conditions.push(lte(storeOrders.createdAt, new Date(input.to + 'T23:59:59')));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const orders = await ctx.db
        .select()
        .from(storeOrders)
        .where(where)
        .orderBy(desc(storeOrders.createdAt))
        .limit(5000);

      const rows: Record<string, unknown>[] = orders.map((o) => ({
        orderNumber: o.orderNumber,
        invoiceNumber: o.invoiceNumber ?? '',
        status: o.status,
        customerName: addressField(o.shippingAddress, 'firstName', 'lastName'),
        email: addressField(o.billingProfile, 'invoiceEmail'),
        subtotal: centsToDecimal(o.subtotalCents),
        shipping: centsToDecimal(o.shippingCents),
        tax: centsToDecimal(o.taxCents),
        discount: centsToDecimal(o.discountCents),
        total: centsToDecimal(o.totalCents),
        currency: o.currency,
        paidAt: fmtDate(o.paidAt),
        shippedAt: fmtDate(o.shippedAt),
        deliveredAt: fmtDate(o.deliveredAt),
        createdAt: fmtDate(o.createdAt),
      }));

      const headers = [
        'orderNumber',
        'invoiceNumber',
        'status',
        'customerName',
        'email',
        'subtotal',
        'shipping',
        'tax',
        'discount',
        'total',
        'currency',
        'paidAt',
        'shippedAt',
        'deliveredAt',
        'createdAt',
      ];

      const { data, contentType } = serializeExport(rows, headers, input.format);

      const dateStr = new Date().toISOString().slice(0, 10);
      const ext = input.format === 'json' ? 'json' : 'csv';

      return { data, contentType, filename: `orders-export-${dateStr}.${ext}` };
    }),

  /**
   * Refund an order. Updates status, optionally triggers payment refund
   * via the pluggable RefundHandler, and notifies the customer.
   */
  refundOrder: storeAdminProcedure
    .input(
      z.object({
        orderId: z.string().uuid(),
        reason: z.string().max(500).optional(),
        notifyCustomer: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [order] = await ctx.db
        .select()
        .from(storeOrders)
        .where(eq(storeOrders.id, input.orderId))
        .limit(1);

      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      const refundableStatuses = ['processing', 'shipped', 'delivered'] as const;
      if (!refundableStatuses.includes(order.status as (typeof refundableStatuses)[number])) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot refund an order with status "${order.status}". Only processing, shipped, or delivered orders can be refunded.`,
        });
      }

      // Update order status to refunded
      await updateOrderStatus(
        input.orderId,
        'refunded',
        ctx.session.user.id,
        input.reason ?? 'Refund issued by admin',
      );

      // Attempt payment refund via optional handler
      const refundHandler = getRefundHandler();
      let refundId: string | undefined;

      if (refundHandler && order.paymentTransactionId) {
        try {
          const result = await refundHandler.refundPayment({
            orderId: order.id,
            transactionId: order.paymentTransactionId,
            amountCents: order.totalCents,
            currency: order.currency,
            reason: input.reason,
          });
          refundId = result.refundId;
          logger.info('Payment refund processed', { orderId: order.id, refundId });
        } catch (err) {
          logger.error('Payment refund failed', {
            orderId: order.id,
            error: err instanceof Error ? err.message : String(err),
          });
          // Order is already marked refunded — log but don't throw.
          // Admin can retry the payment refund manually in the provider dashboard.
        }
      }

      // Notify the customer
      if (input.notifyCustomer) {
        const deps = getStoreDeps();
        deps.sendNotification({
          userId: order.placedByUserId,
          title: `Order ${order.orderNumber} — Refunded`,
          body: input.reason ?? 'Your order has been refunded.',
          actionUrl: `/account/orders/${order.id}`,
        });

        // Also send email if billing profile has an email
        const billingProfile = order.billingProfile as Record<string, unknown> | null;
        const email = billingProfile?.invoiceEmail as string | undefined;
        if (email) {
          deps.enqueueTemplateEmail(email, 'order-refunded', {
            orderNumber: order.orderNumber,
            total: centsToDecimal(order.totalCents),
            currency: order.currency,
            reason: input.reason ?? '',
          }).catch((err) => {
            logger.error('Failed to send refund email', { error: String(err) });
          });
        }
      }

      return { success: true, refundId };
    }),

  /**
   * Generate a print-ready HTML invoice for an order.
   * If the order does not yet have an invoice number, one is assigned (sequential, EU-compliant).
   * The client renders this in a new tab and uses browser print-to-PDF.
   */
  generateInvoice: storeAdminProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [order] = await ctx.db
        .select()
        .from(storeOrders)
        .where(eq(storeOrders.id, input.orderId))
        .limit(1);

      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      const items = await ctx.db
        .select()
        .from(storeOrderItems)
        .where(eq(storeOrderItems.orderId, order.id))
        .limit(200);

      // Assign invoice number if not yet assigned
      let invoiceNumber = order.invoiceNumber;
      if (!invoiceNumber) {
        invoiceNumber = await assignInvoiceNumber(order.id);
      }

      // Extract address info from JSON snapshots
      const shipping = (order.shippingAddress ?? {}) as Record<string, unknown>;
      const bp = (order.billingProfile ?? {}) as Record<string, unknown>;

      const buyerName =
        (bp.legalName as string) ||
        [shipping.firstName, shipping.lastName].filter(Boolean).join(' ') ||
        'Customer';

      const buyerAddress = [
        bp.address1 || shipping.address1,
        bp.address2 || shipping.address2,
        [bp.postalCode || shipping.postalCode, bp.city || shipping.city]
          .filter(Boolean)
          .join(' '),
        bp.country || shipping.country,
      ]
        .filter(Boolean)
        .join('\n');

      // Seller info from deps or fallback
      // In production, this comes from site config or billing profile.
      // We use a reasonable fallback here — projects should customize.
      const sellerName = 'Your Company'; // TODO: wire from site config
      const sellerAddress = ''; // TODO: wire from site config

      // Build tax details
      const taxDetailsRaw = order.taxDetails as {
        lineItemTax?: Array<{ name?: string; rate: number; taxCents: number }>;
      } | null;

      const taxDetailsFormatted = taxDetailsRaw?.lineItemTax
        ?.filter((t) => t.taxCents > 0)
        ?.reduce(
          (acc, t) => {
            const key = `${t.rate}`;
            if (!acc[key]) {
              acc[key] = { name: t.name ?? 'Tax', rate: `${t.rate}%`, amountCents: 0 };
            }
            acc[key]!.amountCents += t.taxCents;
            return acc;
          },
          {} as Record<string, { name: string; rate: string; amountCents: number }>,
        );

      const taxDetails = taxDetailsFormatted
        ? Object.values(taxDetailsFormatted).map((t) => ({
            name: t.name,
            rate: t.rate,
            amount: centsToDecimal(t.amountCents),
          }))
        : undefined;

      const html = generateInvoiceHtml({
        orderNumber: order.orderNumber,
        invoiceNumber,
        orderDate: order.createdAt.toISOString().slice(0, 10),
        paidAt: order.paidAt ? order.paidAt.toISOString().slice(0, 10) : null,

        sellerName,
        sellerAddress,
        sellerVatId: undefined, // TODO: wire from site config

        buyerName,
        buyerAddress,
        buyerVatId: (bp.vatId as string) || undefined,

        items: items.map((item) => ({
          name: item.productName,
          variant: item.variantName ?? undefined,
          quantity: item.quantity,
          unitPrice: centsToDecimal(item.unitPriceCents),
          total: centsToDecimal(item.totalCents),
          taxRate: item.taxRate ?? undefined,
        })),

        subtotal: centsToDecimal(order.subtotalCents),
        shipping: centsToDecimal(order.shippingCents),
        tax: centsToDecimal(order.taxCents),
        discount: order.discountCents > 0 ? centsToDecimal(order.discountCents) : undefined,
        total: centsToDecimal(order.totalCents),
        currency: order.currency,
        taxDetails,
      });

      return { html, invoiceNumber };
    }),
});
