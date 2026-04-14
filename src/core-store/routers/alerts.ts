import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { storeBackInStockAlerts } from '@/core-store/schema/alerts';
import { storeProducts } from '@/core-store/schema/products';
import {
  subscribe,
  unsubscribe,
  isSubscribed,
} from '@/core-store/lib/back-in-stock-service';

export const storeAlertsRouter = createTRPCRouter({
  /** Subscribe to back-in-stock alerts for a product (or variant) */
  subscribe: protectedProcedure
    .input(
      z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await subscribe(ctx.session.user.id, input.productId, input.variantId);
      return { success: true };
    }),

  /** Unsubscribe from back-in-stock alerts */
  unsubscribe: protectedProcedure
    .input(
      z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await unsubscribe(ctx.session.user.id, input.productId, input.variantId);
      return { success: true };
    }),

  /** Check if the current user has an active alert for a product */
  checkAlert: protectedProcedure
    .input(
      z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const subscribed = await isSubscribed(
        ctx.session.user.id,
        input.productId,
        input.variantId,
      );
      return { subscribed };
    }),

  /** List my active (non-notified) back-in-stock alerts with product info */
  myAlerts: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const alerts = await ctx.db
      .select({
        id: storeBackInStockAlerts.id,
        productId: storeBackInStockAlerts.productId,
        variantId: storeBackInStockAlerts.variantId,
        createdAt: storeBackInStockAlerts.createdAt,
        productName: storeProducts.name,
        productImage: storeProducts.featuredImage,
      })
      .from(storeBackInStockAlerts)
      .innerJoin(storeProducts, eq(storeProducts.id, storeBackInStockAlerts.productId))
      .where(
        and(
          eq(storeBackInStockAlerts.userId, userId),
          isNull(storeBackInStockAlerts.notifiedAt),
        ),
      )
      .limit(50);

    return alerts;
  }),
});
