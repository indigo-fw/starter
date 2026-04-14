import { z } from 'zod';
import { createTRPCRouter, sectionProcedure } from '@/server/trpc';
import {
  getOrderShipments,
  createShipment,
  updateShipmentStatus,
  getUnfulfilledItems,
  generatePackingSlip,
} from '@/core-store/lib/fulfillment-service';

const storeAdminProcedure = sectionProcedure('settings');

export const storeFulfillmentRouter = createTRPCRouter({
  /** List all shipments for an order */
  listShipments: storeAdminProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ input }) => {
      return getOrderShipments(input.orderId);
    }),

  /** Create a new shipment for an order (partial or full) */
  createShipment: storeAdminProcedure
    .input(
      z.object({
        orderId: z.string().uuid(),
        items: z
          .array(
            z.object({
              orderItemId: z.string().uuid(),
              quantity: z.number().int().min(1),
            }),
          )
          .min(1)
          .max(50),
        trackingNumber: z.string().max(255).optional(),
        trackingUrl: z.string().max(1000).optional(),
        carrier: z.string().max(255).optional(),
        note: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const shipmentId = await createShipment({
        orderId: input.orderId,
        items: input.items,
        trackingNumber: input.trackingNumber,
        trackingUrl: input.trackingUrl,
        carrier: input.carrier,
        note: input.note,
      });

      return { shipmentId };
    }),

  /** Update shipment status (shipped / delivered) with optional tracking */
  updateShipment: storeAdminProcedure
    .input(
      z.object({
        shipmentId: z.string().uuid(),
        status: z.enum(['shipped', 'delivered']),
        trackingNumber: z.string().max(255).optional(),
        trackingUrl: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await updateShipmentStatus(input.shipmentId, input.status, {
        trackingNumber: input.trackingNumber,
        trackingUrl: input.trackingUrl,
      });

      return { success: true };
    }),

  /** Get unfulfilled items for an order */
  getUnfulfilled: storeAdminProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ input }) => {
      return getUnfulfilledItems(input.orderId);
    }),

  /** Generate a print-ready packing slip HTML for a shipment */
  getPackingSlip: storeAdminProcedure
    .input(z.object({ shipmentId: z.string().uuid() }))
    .query(async ({ input }) => {
      const html = await generatePackingSlip(input.shipmentId);
      return { html };
    }),
});
