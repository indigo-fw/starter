import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and } from 'drizzle-orm';
import { createTRPCRouter, publicProcedure } from '@/server/trpc';
import { storeCartItems } from '@/core-store/schema/orders';
import { storeProducts, storeProductVariants } from '@/core-store/schema/products';
import { storeInventoryReservations } from '@/core-store/schema/inventory';
import { getOrCreateCart, getCartWithItems, mergeCart } from '@/core-store/lib/cart-service';
import { reserveStock } from '@/core-store/lib/reservation-service';

export const storeCartRouter = createTRPCRouter({
  /** Get current cart */
  get: publicProcedure
    .input(z.object({ sessionId: z.string().max(100).optional() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session?.user
        ? (ctx.session.user as unknown as { id: string }).id
        : null;
      const sessionId = input.sessionId ?? null;

      if (!userId && !sessionId) return { items: [], subtotalCents: 0, itemCount: 0, currency: 'EUR' };

      const cartId = await getOrCreateCart(userId, sessionId);
      const cart = await getCartWithItems(cartId);
      return cart ?? { items: [], subtotalCents: 0, itemCount: 0 };
    }),

  /** Add item to cart */
  addItem: publicProcedure
    .input(z.object({
      sessionId: z.string().max(100).optional(),
      productId: z.string().uuid(),
      variantId: z.string().uuid().optional(),
      quantity: z.number().int().min(1).max(99).default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session?.user
        ? (ctx.session.user as unknown as { id: string }).id
        : null;

      if (!userId && !input.sessionId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Session ID required for anonymous cart' });
      }

      // Verify product exists and is published
      const [product] = await ctx.db
        .select({ id: storeProducts.id, priceCents: storeProducts.priceCents, status: storeProducts.status, type: storeProducts.type })
        .from(storeProducts)
        .where(eq(storeProducts.id, input.productId))
        .limit(1);

      if (!product || product.status !== 'published') {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Product not found' });
      }

      // Get price (from variant if applicable)
      let unitPriceCents = product.priceCents ?? 0;
      if (input.variantId) {
        const [variant] = await ctx.db
          .select({ priceCents: storeProductVariants.priceCents })
          .from(storeProductVariants)
          .where(eq(storeProductVariants.id, input.variantId))
          .limit(1);
        if (!variant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Variant not found' });
        unitPriceCents = variant.priceCents;
      }

      const cartId = await getOrCreateCart(userId, input.sessionId ?? null);

      // Check if item already in cart
      const existingCondition = input.variantId
        ? and(eq(storeCartItems.cartId, cartId), eq(storeCartItems.productId, input.productId), eq(storeCartItems.variantId, input.variantId))
        : and(eq(storeCartItems.cartId, cartId), eq(storeCartItems.productId, input.productId));

      const [existing] = await ctx.db
        .select({ id: storeCartItems.id, quantity: storeCartItems.quantity })
        .from(storeCartItems)
        .where(existingCondition)
        .limit(1);

      if (existing) {
        await ctx.db.update(storeCartItems)
          .set({ quantity: existing.quantity + input.quantity, unitPriceCents })
          .where(eq(storeCartItems.id, existing.id));
      } else {
        await ctx.db.insert(storeCartItems).values({
          cartId,
          productId: input.productId,
          variantId: input.variantId ?? null,
          quantity: input.quantity,
          unitPriceCents,
        });
      }

      // Fire-and-forget stock reservation
      reserveStock(
        cartId,
        input.productId,
        input.variantId ?? null,
        existing ? existing.quantity + input.quantity : input.quantity,
      ).catch(() => {});

      return getCartWithItems(cartId);
    }),

  /** Update item quantity */
  updateItem: publicProcedure
    .input(z.object({
      itemId: z.string().uuid(),
      quantity: z.number().int().min(0).max(99),
    }))
    .mutation(async ({ ctx, input }) => {
      // Read the full item before mutating (needed for reservation + cartId)
      const [item] = await ctx.db
        .select({
          cartId: storeCartItems.cartId,
          productId: storeCartItems.productId,
          variantId: storeCartItems.variantId,
        })
        .from(storeCartItems)
        .where(eq(storeCartItems.id, input.itemId))
        .limit(1);

      if (!item) return { items: [], subtotalCents: 0, itemCount: 0, currency: 'EUR' };

      if (input.quantity === 0) {
        // Delete item and release its reservation
        await ctx.db.delete(storeCartItems).where(eq(storeCartItems.id, input.itemId));
        await ctx.db.delete(storeInventoryReservations).where(
          and(
            eq(storeInventoryReservations.cartId, item.cartId),
            eq(storeInventoryReservations.productId, item.productId),
          ),
        );
      } else {
        await ctx.db.update(storeCartItems)
          .set({ quantity: input.quantity })
          .where(eq(storeCartItems.id, input.itemId));

        // Update stock reservation (fire-and-forget)
        reserveStock(item.cartId, item.productId, item.variantId, input.quantity).catch(() => {});
      }

      return getCartWithItems(item.cartId);
    }),

  /** Remove item from cart */
  removeItem: publicProcedure
    .input(z.object({ itemId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Get cartId + product info before deleting (needed for reservation cleanup)
      const [item] = await ctx.db
        .select({
          cartId: storeCartItems.cartId,
          productId: storeCartItems.productId,
          variantId: storeCartItems.variantId,
        })
        .from(storeCartItems)
        .where(eq(storeCartItems.id, input.itemId))
        .limit(1);

      await ctx.db.delete(storeCartItems).where(eq(storeCartItems.id, input.itemId));

      if (!item) return { items: [], subtotalCents: 0, itemCount: 0, currency: 'EUR' };

      // Release reservation for this item
      await ctx.db.delete(storeInventoryReservations).where(
        and(
          eq(storeInventoryReservations.cartId, item.cartId),
          eq(storeInventoryReservations.productId, item.productId),
        ),
      );

      return getCartWithItems(item.cartId);
    }),

  /** Merge anonymous cart into user cart (called after login) */
  merge: publicProcedure
    .input(z.object({ sessionId: z.string().max(100) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session?.user
        ? (ctx.session.user as unknown as { id: string }).id
        : null;

      if (!userId) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Login required' });

      await mergeCart(input.sessionId, userId);
      const cartId = await getOrCreateCart(userId, null);
      return getCartWithItems(cartId);
    }),
});
