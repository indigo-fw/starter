import { eq, and, sql, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { db } from '@/server/db';
import { storeShipments, storeShipmentItems } from '@/core-store/schema/fulfillment';
import { storeOrders, storeOrderItems, storeOrderEvents } from '@/core-store/schema/orders';
import { updateOrderStatus } from './order-service';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-fulfillment');

// ─── Create Shipment ──────────────────────────────────────────────────────

export async function createShipment(params: {
  orderId: string;
  items: Array<{ orderItemId: string; quantity: number }>;
  trackingNumber?: string;
  trackingUrl?: string;
  carrier?: string;
  note?: string;
}): Promise<string> {
  const { orderId, items } = params;

  // Validate order exists and is in a fulfillable state
  const [order] = await db
    .select({ id: storeOrders.id, status: storeOrders.status, orderNumber: storeOrders.orderNumber })
    .from(storeOrders)
    .where(eq(storeOrders.id, orderId))
    .limit(1);

  if (!order) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
  }

  if (order.status !== 'processing' && order.status !== 'partially_shipped') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Cannot create shipment for order in "${order.status}" status`,
    });
  }

  // Validate quantities against unfulfilled
  const unfulfilled = await getUnfulfilledItems(orderId);
  const unfulfilledMap = new Map(unfulfilled.map((u) => [u.orderItemId, u.remainingQty]));

  for (const item of items) {
    const remaining = unfulfilledMap.get(item.orderItemId) ?? 0;
    if (item.quantity > remaining) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Requested quantity (${item.quantity}) exceeds unfulfilled quantity (${remaining}) for order item ${item.orderItemId}`,
      });
    }
  }

  // Insert shipment
  const shipmentId = crypto.randomUUID();
  await db.insert(storeShipments).values({
    id: shipmentId,
    orderId,
    trackingNumber: params.trackingNumber ?? null,
    trackingUrl: params.trackingUrl ?? null,
    carrier: params.carrier ?? null,
    note: params.note ?? null,
  });

  // Insert shipment items
  for (const item of items) {
    await db.insert(storeShipmentItems).values({
      shipmentId,
      orderItemId: item.orderItemId,
      quantity: item.quantity,
    });
  }

  // Determine if all items are now fulfilled
  const updatedUnfulfilled = await getUnfulfilledItems(orderId);
  const allFulfilled = updatedUnfulfilled.length === 0;

  await updateOrderStatus(
    orderId,
    allFulfilled ? 'shipped' : 'partially_shipped',
    'system',
    allFulfilled ? 'All items shipped' : 'Partial shipment created',
  );

  logger.info('Shipment created', { shipmentId, orderId, itemCount: items.length, allFulfilled });

  return shipmentId;
}

// ─── Update Shipment Status ───────────────────────────────────────────────

export async function updateShipmentStatus(
  shipmentId: string,
  status: string,
  tracking?: { trackingNumber?: string; trackingUrl?: string },
): Promise<void> {
  const [shipment] = await db
    .select({ id: storeShipments.id, orderId: storeShipments.orderId })
    .from(storeShipments)
    .where(eq(storeShipments.id, shipmentId))
    .limit(1);

  if (!shipment) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Shipment not found' });
  }

  const updates: Record<string, unknown> = { status };
  if (tracking?.trackingNumber) updates.trackingNumber = tracking.trackingNumber;
  if (tracking?.trackingUrl) updates.trackingUrl = tracking.trackingUrl;
  if (status === 'shipped') updates.shippedAt = new Date();
  if (status === 'delivered') updates.deliveredAt = new Date();

  await db.update(storeShipments)
    .set(updates)
    .where(eq(storeShipments.id, shipmentId));

  // If delivered, check if all shipments for the order are delivered
  if (status === 'delivered') {
    const shipments = await db
      .select({ status: storeShipments.status })
      .from(storeShipments)
      .where(eq(storeShipments.orderId, shipment.orderId))
      .limit(100);

    const allDelivered = shipments.every((s) => s.status === 'delivered');
    if (allDelivered) {
      await updateOrderStatus(shipment.orderId, 'delivered', 'system', 'All shipments delivered');
    }
  }

  logger.info('Shipment status updated', { shipmentId, status });
}

// ─── Get Order Shipments ──────────────────────────────────────────────────

export async function getOrderShipments(orderId: string) {
  const shipments = await db
    .select()
    .from(storeShipments)
    .where(eq(storeShipments.orderId, orderId))
    .orderBy(storeShipments.createdAt)
    .limit(50);

  const result = [];

  for (const shipment of shipments) {
    const items = await db
      .select({
        id: storeShipmentItems.id,
        orderItemId: storeShipmentItems.orderItemId,
        quantity: storeShipmentItems.quantity,
        productName: storeOrderItems.productName,
        variantName: storeOrderItems.variantName,
      })
      .from(storeShipmentItems)
      .innerJoin(storeOrderItems, eq(storeOrderItems.id, storeShipmentItems.orderItemId))
      .where(eq(storeShipmentItems.shipmentId, shipment.id))
      .limit(100);

    result.push({ ...shipment, items });
  }

  return result;
}

// ─── Get Unfulfilled Items ────────────────────────────────────────────────

export async function getUnfulfilledItems(orderId: string) {
  const orderItems = await db
    .select({
      orderItemId: storeOrderItems.id,
      productName: storeOrderItems.productName,
      orderedQty: storeOrderItems.quantity,
    })
    .from(storeOrderItems)
    .where(eq(storeOrderItems.orderId, orderId))
    .limit(200);

  // Sum shipped quantities per order item across all shipments
  const shipmentItems = await db
    .select({
      orderItemId: storeShipmentItems.orderItemId,
      shippedQty: sql<number>`COALESCE(SUM(${storeShipmentItems.quantity}), 0)`,
    })
    .from(storeShipmentItems)
    .innerJoin(storeShipments, eq(storeShipments.id, storeShipmentItems.shipmentId))
    .where(eq(storeShipments.orderId, orderId))
    .groupBy(storeShipmentItems.orderItemId)
    .limit(200);

  const shippedMap = new Map(shipmentItems.map((s) => [s.orderItemId, s.shippedQty]));

  return orderItems
    .map((item) => {
      const shippedQty = shippedMap.get(item.orderItemId) ?? 0;
      return {
        orderItemId: item.orderItemId,
        productName: item.productName,
        orderedQty: item.orderedQty,
        shippedQty,
        remainingQty: item.orderedQty - shippedQty,
      };
    })
    .filter((item) => item.remainingQty > 0);
}

// ─── Generate Packing Slip ───────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function generatePackingSlip(shipmentId: string): Promise<string> {
  const [shipment] = await db
    .select()
    .from(storeShipments)
    .where(eq(storeShipments.id, shipmentId))
    .limit(1);

  if (!shipment) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Shipment not found' });
  }

  const [order] = await db
    .select({
      orderNumber: storeOrders.orderNumber,
      shippingAddress: storeOrders.shippingAddress,
      customerNote: storeOrders.customerNote,
    })
    .from(storeOrders)
    .where(eq(storeOrders.id, shipment.orderId))
    .limit(1);

  if (!order) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
  }

  const items = await db
    .select({
      productName: storeOrderItems.productName,
      variantName: storeOrderItems.variantName,
      sku: storeOrderItems.sku,
      quantity: storeShipmentItems.quantity,
    })
    .from(storeShipmentItems)
    .innerJoin(storeOrderItems, eq(storeOrderItems.id, storeShipmentItems.orderItemId))
    .where(eq(storeShipmentItems.shipmentId, shipmentId))
    .limit(100);

  const addr = order.shippingAddress as Record<string, string> | null;
  const addressLines = addr
    ? [
        [addr.firstName, addr.lastName].filter(Boolean).join(' '),
        addr.company,
        addr.address1,
        addr.address2,
        [addr.city, addr.state, addr.postalCode].filter(Boolean).join(', '),
        addr.country,
      ].filter(Boolean)
    : [];

  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.productName)}${item.variantName ? `<br><small>${escapeHtml(item.variantName)}</small>` : ''}</td>
        <td>${item.sku ? escapeHtml(item.sku) : '—'}</td>
        <td class="center">${item.quantity}</td>
      </tr>`,
    )
    .join('');

  const shipmentDate = shipment.createdAt.toISOString().slice(0, 10);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Packing Slip — ${escapeHtml(order.orderNumber)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      color: #1a1a2e;
      background: #fff;
      padding: 40px;
      max-width: 210mm;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 2px solid #1a1a2e;
    }
    .header h1 { font-size: 24px; font-weight: 700; }
    .meta { text-align: right; font-size: 12px; color: #6b6b80; }
    .meta strong { color: #1a1a2e; }
    .meta div { margin-bottom: 4px; }
    .ship-to { margin-bottom: 32px; }
    .ship-to-label {
      font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
      color: #6b6b80; font-weight: 600; margin-bottom: 8px;
    }
    .ship-to-address { font-size: 13px; }
    .ship-to-address div { margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead th {
      background: #f8f8fa; border-bottom: 1px solid #e2e2e8;
      padding: 10px 12px; text-align: left;
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
      color: #6b6b80; font-weight: 600;
    }
    thead th.center { text-align: center; }
    tbody td {
      padding: 10px 12px; border-bottom: 1px solid #e2e2e8; vertical-align: top;
    }
    tbody td.center { text-align: center; }
    tbody td small { color: #6b6b80; font-size: 11px; }
    .note { margin-top: 24px; font-size: 12px; color: #6b6b80; }
    @media print {
      body { padding: 0; }
      @page { size: A4; margin: 15mm 20mm; }
      thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>PACKING SLIP</h1>
    <div class="meta">
      <div>Order: <strong>${escapeHtml(order.orderNumber)}</strong></div>
      <div>Shipment: <strong>${escapeHtml(shipmentId.slice(0, 8))}</strong></div>
      <div>Date: ${escapeHtml(shipmentDate)}</div>
      ${shipment.carrier ? `<div>Carrier: ${escapeHtml(shipment.carrier)}</div>` : ''}
      ${shipment.trackingNumber ? `<div>Tracking: ${escapeHtml(shipment.trackingNumber)}</div>` : ''}
    </div>
  </div>

  <div class="ship-to">
    <div class="ship-to-label">Ship To</div>
    <div class="ship-to-address">
      ${addressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('\n      ')}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>SKU</th>
        <th class="center">Qty</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  ${order.customerNote ? `<div class="note"><strong>Customer note:</strong> ${escapeHtml(order.customerNote)}</div>` : ''}
</body>
</html>`;
}
