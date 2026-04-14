import { z } from 'zod';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { storeWishlists } from '@/core-store/schema/wishlists';
import { storeProducts } from '@/core-store/schema/products';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';

export const storeWishlistRouter = createTRPCRouter({
  /** Toggle a product in the user's wishlist */
  toggle: protectedProcedure
    .input(z.object({ productId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [existing] = await ctx.db
        .select({ id: storeWishlists.id })
        .from(storeWishlists)
        .where(and(eq(storeWishlists.userId, userId), eq(storeWishlists.productId, input.productId)))
        .limit(1);

      if (existing) {
        await ctx.db.delete(storeWishlists).where(eq(storeWishlists.id, existing.id));
        return { wishlisted: false };
      }

      await ctx.db.insert(storeWishlists).values({
        userId,
        productId: input.productId,
      });
      return { wishlisted: true };
    }),

  /** List user's wishlisted products with product details */
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [
        eq(storeWishlists.userId, userId),
        eq(storeProducts.status, 'published'),
        isNull(storeProducts.deletedAt),
      ];

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: storeWishlists.id,
            productId: storeProducts.id,
            name: storeProducts.name,
            slug: storeProducts.slug,
            priceCents: storeProducts.priceCents,
            comparePriceCents: storeProducts.comparePriceCents,
            currency: storeProducts.currency,
            featuredImage: storeProducts.featuredImage,
            type: storeProducts.type,
            addedAt: storeWishlists.createdAt,
          })
          .from(storeWishlists)
          .innerJoin(storeProducts, eq(storeWishlists.productId, storeProducts.id))
          .where(and(...conditions))
          .orderBy(desc(storeWishlists.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: count() })
          .from(storeWishlists)
          .innerJoin(storeProducts, eq(storeWishlists.productId, storeProducts.id))
          .where(and(...conditions)),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Check if a single product is wishlisted */
  check: protectedProcedure
    .input(z.object({ productId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ id: storeWishlists.id })
        .from(storeWishlists)
        .where(and(eq(storeWishlists.userId, ctx.session.user.id), eq(storeWishlists.productId, input.productId)))
        .limit(1);

      return { wishlisted: !!row };
    }),

  /** Check wishlist state for multiple products at once */
  checkMany: protectedProcedure
    .input(z.object({ productIds: z.array(z.string().uuid()).max(100) }))
    .query(async ({ ctx, input }) => {
      if (input.productIds.length === 0) return { wishlistedIds: [] };

      const rows = await ctx.db
        .select({ productId: storeWishlists.productId })
        .from(storeWishlists)
        .where(and(
          eq(storeWishlists.userId, ctx.session.user.id),
          inArray(storeWishlists.productId, input.productIds),
        ))
        .limit(100);

      return { wishlistedIds: rows.map((r) => r.productId) };
    }),
});
