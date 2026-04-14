import { z } from 'zod';
import { and, eq, isNull, inArray } from 'drizzle-orm';
import { createTRPCRouter, publicProcedure, sectionProcedure } from '@/server/trpc';
import { storeRelatedProducts } from '@/core-store/schema/relations';
import { storeProducts } from '@/core-store/schema/products';

const storeAdminProcedure = sectionProcedure('settings');

const relationType = z.enum(['related', 'upsell', 'crosssell']);

export const storeRelationsRouter = createTRPCRouter({
  // ─── Public ───────────────────────────────────────────────────────────────

  /** Get related/upsell/crosssell products for a product (storefront) */
  getRelated: publicProcedure
    .input(z.object({
      productId: z.string().uuid(),
      type: relationType.default('related'),
      limit: z.number().int().min(1).max(12).default(4),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: storeProducts.id,
          name: storeProducts.name,
          slug: storeProducts.slug,
          priceCents: storeProducts.priceCents,
          comparePriceCents: storeProducts.comparePriceCents,
          currency: storeProducts.currency,
          featuredImage: storeProducts.featuredImage,
          shortDescription: storeProducts.shortDescription,
          type: storeRelatedProducts.type,
        })
        .from(storeRelatedProducts)
        .innerJoin(storeProducts, eq(storeRelatedProducts.relatedProductId, storeProducts.id))
        .where(and(
          eq(storeRelatedProducts.productId, input.productId),
          eq(storeRelatedProducts.type, input.type),
          eq(storeProducts.status, 'published'),
          isNull(storeProducts.deletedAt),
        ))
        .orderBy(storeRelatedProducts.sortOrder)
        .limit(input.limit);

      return rows;
    }),

  // ─── Admin ────────────────────────────────────────────────────────────────

  /** Set related products for a product+type (replaces existing) */
  adminSetRelated: storeAdminProcedure
    .input(z.object({
      productId: z.string().uuid(),
      type: relationType,
      relatedProductIds: z.array(z.string().uuid()).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        // Remove existing relations for this product+type
        await tx
          .delete(storeRelatedProducts)
          .where(and(
            eq(storeRelatedProducts.productId, input.productId),
            eq(storeRelatedProducts.type, input.type),
          ));

        // Insert new relations with sortOrder based on array index
        if (input.relatedProductIds.length > 0) {
          await tx.insert(storeRelatedProducts).values(
            input.relatedProductIds.map((relatedProductId, idx) => ({
              productId: input.productId,
              relatedProductId,
              type: input.type,
              sortOrder: idx,
            })),
          );
        }
      });

      return { success: true };
    }),

  /** Get current related product IDs grouped by type */
  adminGetRelated: storeAdminProcedure
    .input(z.object({
      productId: z.string().uuid(),
      type: relationType.optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(storeRelatedProducts.productId, input.productId)];
      if (input.type) {
        conditions.push(eq(storeRelatedProducts.type, input.type));
      }

      const rows = await ctx.db
        .select({
          relatedProductId: storeRelatedProducts.relatedProductId,
          type: storeRelatedProducts.type,
          sortOrder: storeRelatedProducts.sortOrder,
          // Include product info for admin display
          name: storeProducts.name,
          slug: storeProducts.slug,
          featuredImage: storeProducts.featuredImage,
        })
        .from(storeRelatedProducts)
        .innerJoin(storeProducts, eq(storeRelatedProducts.relatedProductId, storeProducts.id))
        .where(and(...conditions))
        .orderBy(storeRelatedProducts.sortOrder)
        .limit(100);

      // Group by type
      const grouped: Record<string, typeof rows> = {};
      for (const row of rows) {
        const key = row.type;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(row);
      }

      return grouped;
    }),
});
