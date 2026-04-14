import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { storeOrders, storeOrderItems, storeOrderEvents, storeDownloads } from '@/core-store/schema/orders';
import { storeProducts, storeProductVariants } from '@/core-store/schema/products';
import { createLogger } from '@/core/lib/infra/logger';
import { checkLowStock } from './inventory-alerts';
import { sendOrderStatusNotification } from './order-notifications';
import type { CartWithItems } from './cart-service';
import type { TaxCalculation } from './tax-service';
import type { TotalAdjustment } from './totals-pipeline';

const logger = createLogger('store-orders');

import type { BillingProfileSnapshot } from '@/core-store/types/billing';

export type { BillingProfileSnapshot };

export interface CreateOrderParams {
  organizationId: string;
  placedByUserId: string;
  cart: CartWithItems;
  shippingAddress: Record<string, unknown>;
  billingProfile: BillingProfileSnapshot;
  shippingMethod?: string;
  shippingCents: number;
  taxCents: number;
  taxDetails: { lineItemTax: TaxCalculation[] };
  discountCents?: number;
  discountCode?: string;
  customerNote?: string;
  paymentProviderId?: string;
  paymentTransactionId?: string;
  /** Full pipeline adjustments breakdown (stored in order metadata) */
  adjustments?: TotalAdjustment[];
}

/**
 * Generate sequential order number: ORD-YYYYMMDD-XXXX
 */
async function generateOrderNumber(): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `ORD-${date}-`;

  // Count today's orders
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(storeOrders)
    .where(sql`${storeOrders.orderNumber} LIKE ${prefix + '%'}`);

  const seq = String((result?.count ?? 0) + 1).padStart(4, '0');
  return `${prefix}${seq}`;
}

/**
 * Create an order from a cart.
 */
export async function createOrder(params: CreateOrderParams): Promise<{ orderId: string; orderNumber: string }> {
  const orderNumber = await generateOrderNumber();
  const orderId = crypto.randomUUID();

  const subtotalCents = params.cart.subtotalCents;
  const totalCents = subtotalCents + params.shippingCents + params.taxCents - (params.discountCents ?? 0);

  // Create order
  await db.insert(storeOrders).values({
    id: orderId,
    orderNumber,
    organizationId: params.organizationId,
    placedByUserId: params.placedByUserId,
    status: 'pending',
    currency: params.cart.currency,
    subtotalCents,
    shippingCents: params.shippingCents,
    taxCents: params.taxCents,
    discountCents: params.discountCents ?? 0,
    totalCents,
    shippingAddress: params.shippingAddress,
    billingProfile: params.billingProfile,
    shippingMethod: params.shippingMethod ?? null,
    discountCode: params.discountCode ?? null,
    customerNote: params.customerNote ?? null,
    taxDetails: params.taxDetails,
    paymentProviderId: params.paymentProviderId ?? null,
    paymentTransactionId: params.paymentTransactionId ?? null,
    metadata: params.adjustments ? { adjustments: params.adjustments } : null,
  });

  // Create order items
  for (let i = 0; i < params.cart.items.length; i++) {
    const item = params.cart.items[i]!;
    const tax = params.taxDetails.lineItemTax[i];

    const orderItemId = crypto.randomUUID();
    const isDigital = !!(item.productId && await isDigitalProduct(item.productId));

    await db.insert(storeOrderItems).values({
      id: orderItemId,
      orderId,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalCents: item.totalCents,
      taxCents: tax?.taxCents ?? 0,
      taxRate: tax ? `${tax.rate}%` : null,
      isDigital,
      image: item.image,
    });

    // Create download link for digital products
    if (isDigital) {
      const [product] = await db
        .select({ digitalFileUrl: storeProducts.digitalFileUrl, downloadLimit: storeProducts.downloadLimit })
        .from(storeProducts)
        .where(eq(storeProducts.id, item.productId))
        .limit(1);

      if (product?.digitalFileUrl) {
        await db.insert(storeDownloads).values({
          orderId,
          orderItemId,
          organizationId: params.organizationId,
          grantedToUserId: params.placedByUserId,
          token: crypto.randomUUID(),
          fileUrl: product.digitalFileUrl,
          downloadLimit: product.downloadLimit,
        });
      }
    }

    // Inventory deducted on payment confirmation (webhook), not here.
    // This prevents stock loss when payment fails.
  }

  // Log creation event
  await db.insert(storeOrderEvents).values({
    orderId,
    status: 'pending',
    note: 'Order created',
    actor: params.placedByUserId,
  });

  logger.info('Order created', { orderId, orderNumber, totalCents });

  return { orderId, orderNumber };
}

async function isDigitalProduct(productId: string): Promise<boolean> {
  const [product] = await db
    .select({ type: storeProducts.type })
    .from(storeProducts)
    .where(eq(storeProducts.id, productId))
    .limit(1);
  return product?.type === 'digital';
}

/**
 * Update order status with event logging.
 */
export async function updateOrderStatus(
  orderId: string,
  status: string,
  actor: string,
  note?: string,
  extra?: { trackingNumber?: string; trackingUrl?: string },
): Promise<void> {
  const updates: Record<string, unknown> = { status, updatedAt: new Date() };

  if (status === 'processing') updates.paidAt = new Date();
  if (status === 'shipped') {
    updates.shippedAt = new Date();
    if (extra?.trackingNumber) updates.trackingNumber = extra.trackingNumber;
    if (extra?.trackingUrl) updates.trackingUrl = extra.trackingUrl;
  }
  if (status === 'delivered') updates.deliveredAt = new Date();
  if (status === 'cancelled') updates.cancelledAt = new Date();
  if (status === 'refunded') updates.refundedAt = new Date();

  await db.update(storeOrders)
    .set(updates)
    .where(eq(storeOrders.id, orderId));

  await db.insert(storeOrderEvents).values({
    orderId,
    status,
    note: note ?? null,
    actor,
  });

  logger.info('Order status updated', { orderId, status, actor });

  // Send email + in-app notification (fire-and-forget)
  sendOrderStatusNotification(orderId, status).catch(() => {});
}

/**
 * Generate invoice number for an order (EU compliance).
 * Format: INV-YYYY-XXXXX (sequential per year).
 */
export async function assignInvoiceNumber(orderId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(storeOrders)
    .where(sql`${storeOrders.invoiceNumber} LIKE ${prefix + '%'}`);

  const seq = String((result?.count ?? 0) + 1).padStart(5, '0');
  const invoiceNumber = `${prefix}${seq}`;

  await db.update(storeOrders)
    .set({ invoiceNumber })
    .where(eq(storeOrders.id, orderId));

  return invoiceNumber;
}

/**
 * Deduct inventory for all items in an order.
 * Called on payment confirmation (not at order creation).
 */
export async function deductOrderInventory(orderId: string): Promise<void> {
  const items = await db
    .select({
      productId: storeOrderItems.productId,
      variantId: storeOrderItems.variantId,
      quantity: storeOrderItems.quantity,
    })
    .from(storeOrderItems)
    .where(eq(storeOrderItems.orderId, orderId))
    .limit(200);

  for (const item of items) {
    if (item.variantId) {
      await db.update(storeProductVariants)
        .set({ stockQuantity: sql`${storeProductVariants.stockQuantity} - ${item.quantity}` })
        .where(eq(storeProductVariants.id, item.variantId));
    } else if (item.productId) {
      await db.update(storeProducts)
        .set({ stockQuantity: sql`${storeProducts.stockQuantity} - ${item.quantity}` })
        .where(eq(storeProducts.id, item.productId));
    }

    // Check for low stock (fire-and-forget)
    if (item.productId) {
      checkLowStock(item.productId, item.variantId ?? undefined).catch(() => {});
    }
  }

  logger.info('Inventory deducted for order', { orderId, itemCount: items.length });
}

/**
 * Restore inventory for all items in an order.
 * Called on payment failure, cancellation, or refund.
 */
export async function restoreOrderInventory(orderId: string): Promise<void> {
  const items = await db
    .select({
      productId: storeOrderItems.productId,
      variantId: storeOrderItems.variantId,
      quantity: storeOrderItems.quantity,
    })
    .from(storeOrderItems)
    .where(eq(storeOrderItems.orderId, orderId))
    .limit(200);

  for (const item of items) {
    if (item.variantId) {
      await db.update(storeProductVariants)
        .set({ stockQuantity: sql`${storeProductVariants.stockQuantity} + ${item.quantity}` })
        .where(eq(storeProductVariants.id, item.variantId));
    } else if (item.productId) {
      await db.update(storeProducts)
        .set({ stockQuantity: sql`${storeProducts.stockQuantity} + ${item.quantity}` })
        .where(eq(storeProducts.id, item.productId));
    }
  }

  logger.info('Inventory restored for order', { orderId, itemCount: items.length });
}
