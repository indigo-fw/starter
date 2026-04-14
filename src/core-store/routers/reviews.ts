import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, avg, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, publicProcedure, sectionProcedure } from '@/server/trpc';
import { storeReviews } from '@/core-store/schema/reviews';
import { storeProducts } from '@/core-store/schema/products';
import { storeOrders, storeOrderItems } from '@/core-store/schema/orders';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import type { DrizzleDB } from '@/server/db';

const storeAdminProcedure = sectionProcedure('settings');

/** Build aggregate rating stats for approved reviews of a product */
async function getProductRatingStats(db: DrizzleDB, productId: string) {
  const conditions = [
    eq(storeReviews.productId, productId),
    eq(storeReviews.status, 'approved'),
  ];

  const [aggRow] = await db
    .select({
      averageRating: avg(storeReviews.rating),
      totalReviews: count(),
    })
    .from(storeReviews)
    .where(and(...conditions))
    .limit(1);

  const distribution = await db
    .select({
      rating: storeReviews.rating,
      count: count(),
    })
    .from(storeReviews)
    .where(and(...conditions))
    .groupBy(storeReviews.rating)
    .limit(5);

  const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of distribution) {
    ratingDistribution[row.rating] = row.count;
  }

  return {
    averageRating: aggRow?.averageRating ? parseFloat(String(aggRow.averageRating)) : 0,
    totalReviews: aggRow?.totalReviews ?? 0,
    ratingDistribution,
  };
}

export const storeReviewsRouter = createTRPCRouter({
  // ─── Public ───────────────────────────────────────────────────────────────

  /** List approved reviews for a product */
  listByProduct: publicProcedure
    .input(z.object({
      productId: z.string().uuid(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [
        eq(storeReviews.productId, input.productId),
        eq(storeReviews.status, 'approved'),
      ];

      const [items, [countRow], aggregate] = await Promise.all([
        ctx.db
          .select({
            id: storeReviews.id,
            rating: storeReviews.rating,
            title: storeReviews.title,
            body: storeReviews.body,
            verifiedPurchase: storeReviews.verifiedPurchase,
            createdAt: storeReviews.createdAt,
          })
          .from(storeReviews)
          .where(and(...conditions))
          .orderBy(desc(storeReviews.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(storeReviews).where(and(...conditions)),
        getProductRatingStats(ctx.db, input.productId),
      ]);

      return {
        ...paginatedResult(items, countRow?.count ?? 0, page, pageSize),
        aggregate,
      };
    }),

  /** Lightweight rating info for product cards */
  getProductRating: publicProcedure
    .input(z.object({ productId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          averageRating: avg(storeReviews.rating),
          totalReviews: count(),
        })
        .from(storeReviews)
        .where(and(
          eq(storeReviews.productId, input.productId),
          eq(storeReviews.status, 'approved'),
        ))
        .limit(1);

      return {
        averageRating: row?.averageRating ? parseFloat(String(row.averageRating)) : 0,
        totalReviews: row?.totalReviews ?? 0,
      };
    }),

  /** Batch ratings for product listing pages */
  getProductRatings: publicProcedure
    .input(z.object({ productIds: z.array(z.string().uuid()).max(100) }))
    .query(async ({ ctx, input }) => {
      if (input.productIds.length === 0) return [];

      const rows = await ctx.db
        .select({
          productId: storeReviews.productId,
          averageRating: avg(storeReviews.rating),
          totalReviews: count(),
        })
        .from(storeReviews)
        .where(and(
          inArray(storeReviews.productId, input.productIds),
          eq(storeReviews.status, 'approved'),
        ))
        .groupBy(storeReviews.productId)
        .limit(100);

      return rows.map((r) => ({
        productId: r.productId,
        averageRating: r.averageRating ? parseFloat(String(r.averageRating)) : 0,
        totalReviews: r.totalReviews,
      }));
    }),

  // ─── Protected ────────────────────────────────────────────────────────────

  /** Submit a review */
  create: protectedProcedure
    .input(z.object({
      productId: z.string().uuid(),
      rating: z.number().int().min(1).max(5),
      title: z.string().max(255).optional(),
      body: z.string().max(5000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check for existing review
      const [existing] = await ctx.db
        .select({ id: storeReviews.id })
        .from(storeReviews)
        .where(and(
          eq(storeReviews.productId, input.productId),
          eq(storeReviews.userId, userId),
        ))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'You have already reviewed this product',
        });
      }

      // Check if user purchased this product (verified purchase)
      const [purchase] = await ctx.db
        .select({ id: storeOrderItems.id })
        .from(storeOrderItems)
        .innerJoin(storeOrders, eq(storeOrderItems.orderId, storeOrders.id))
        .where(and(
          eq(storeOrders.placedByUserId, userId),
          eq(storeOrderItems.productId, input.productId),
          // Only count paid orders (not pending/cancelled/refunded)
          inArray(storeOrders.status, ['processing', 'shipped', 'delivered']),
        ))
        .limit(1);

      const id = crypto.randomUUID();
      await ctx.db.insert(storeReviews).values({
        id,
        productId: input.productId,
        userId,
        rating: input.rating,
        title: input.title,
        body: input.body,
        verifiedPurchase: !!purchase,
      });

      return { id };
    }),

  /** Get the current user's review for a product */
  myReview: protectedProcedure
    .input(z.object({ productId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [review] = await ctx.db
        .select({
          id: storeReviews.id,
          rating: storeReviews.rating,
          title: storeReviews.title,
          body: storeReviews.body,
          status: storeReviews.status,
          verifiedPurchase: storeReviews.verifiedPurchase,
          createdAt: storeReviews.createdAt,
        })
        .from(storeReviews)
        .where(and(
          eq(storeReviews.productId, input.productId),
          eq(storeReviews.userId, ctx.session.user.id),
        ))
        .limit(1);

      return review ?? null;
    }),

  // ─── Admin ────────────────────────────────────────────────────────────────

  /** List all reviews (admin) */
  adminList: storeAdminProcedure
    .input(z.object({
      status: z.enum(['pending', 'approved', 'rejected']).optional(),
      productId: z.string().uuid().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions: ReturnType<typeof eq>[] = [];
      if (input.status) conditions.push(eq(storeReviews.status, input.status));
      if (input.productId) conditions.push(eq(storeReviews.productId, input.productId));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: storeReviews.id,
            productId: storeReviews.productId,
            productName: storeProducts.name,
            userId: storeReviews.userId,
            rating: storeReviews.rating,
            title: storeReviews.title,
            body: storeReviews.body,
            status: storeReviews.status,
            verifiedPurchase: storeReviews.verifiedPurchase,
            createdAt: storeReviews.createdAt,
          })
          .from(storeReviews)
          .innerJoin(storeProducts, eq(storeReviews.productId, storeProducts.id))
          .where(whereClause)
          .orderBy(desc(storeReviews.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(storeReviews).where(whereClause),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Moderate a review (approve/reject) */
  moderate: storeAdminProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['approved', 'rejected']),
    }))
    .mutation(async ({ ctx, input }) => {
      const [review] = await ctx.db
        .select({ id: storeReviews.id })
        .from(storeReviews)
        .where(eq(storeReviews.id, input.id))
        .limit(1);

      if (!review) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Review not found' });
      }

      await ctx.db
        .update(storeReviews)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(storeReviews.id, input.id));

      return { success: true };
    }),

  /** Delete a review (admin) */
  adminDelete: storeAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [review] = await ctx.db
        .select({ id: storeReviews.id })
        .from(storeReviews)
        .where(eq(storeReviews.id, input.id))
        .limit(1);

      if (!review) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Review not found' });
      }

      await ctx.db.delete(storeReviews).where(eq(storeReviews.id, input.id));
      return { success: true };
    }),
});
