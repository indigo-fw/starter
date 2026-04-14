import { z } from 'zod';
import { and, eq, lte, asc, isNull } from 'drizzle-orm';
import { createTRPCRouter, sectionProcedure } from '@/server/trpc';
import { getStoreStats, getTaxReport } from '@/core-store/lib/store-stats';
import { storeProducts } from '@/core-store/schema/products';

const storeAdminProcedure = sectionProcedure('settings');

export const storeAdminRouter = createTRPCRouter({
  /**
   * Aggregated store stats (orders, revenue, AOV, top products, etc.)
   * with optional date range filter. Results are cached for 5 minutes.
   */
  getStats: storeAdminProcedure
    .input(
      z.object({
        from: z.string().max(30).optional(),
        to: z.string().max(30).optional(),
      }),
    )
    .query(async ({ input }) => {
      return getStoreStats(input.from, input.to);
    }),

  /**
   * Tax report aggregated by country for a given date range.
   * Optionally filter by a specific 2-letter country code.
   */
  getTaxReport: storeAdminProcedure
    .input(
      z.object({
        from: z.string().max(30),
        to: z.string().max(30),
        country: z.string().length(2).optional(),
      }),
    )
    .query(async ({ input }) => {
      return getTaxReport(input.from, input.to, input.country);
    }),

  /**
   * Inventory report — products with stock at or below the low-stock threshold.
   * Only includes products with trackInventory enabled.
   */
  getInventoryReport: storeAdminProcedure.query(async ({ ctx }) => {
    const lowStockProducts = await ctx.db
      .select({
        name: storeProducts.name,
        sku: storeProducts.sku,
        stockQuantity: storeProducts.stockQuantity,
        lowStockThreshold: storeProducts.lowStockThreshold,
        type: storeProducts.type,
      })
      .from(storeProducts)
      .where(
        and(
          eq(storeProducts.trackInventory, true),
          lte(storeProducts.stockQuantity, storeProducts.lowStockThreshold),
          isNull(storeProducts.deletedAt),
        ),
      )
      .orderBy(asc(storeProducts.stockQuantity))
      .limit(100);

    return lowStockProducts;
  }),
});
