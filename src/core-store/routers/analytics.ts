import { z } from 'zod';
import { sql, and, gte, desc, count, sum, inArray } from 'drizzle-orm';
import { createTRPCRouter, sectionProcedure } from '@/server/trpc';
import { storeOrders, storeOrderItems } from '@/core-store/schema/orders';

const proc = sectionProcedure('settings');

const paidStatuses = ['processing', 'shipped', 'delivered'] as const;

const daysInput = z.object({
  days: z.number().int().min(1).max(365).default(30),
});

export const storeAnalyticsRouter = createTRPCRouter({
  /**
   * Key metrics for a date range: revenue, order count, AOV, pending orders.
   */
  overview: proc
    .input(daysInput)
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const [revenueRow] = await ctx.db
        .select({
          totalRevenue: sum(storeOrders.totalCents),
          orderCount: count(),
        })
        .from(storeOrders)
        .where(
          and(
            gte(storeOrders.createdAt, since),
            inArray(storeOrders.status, [...paidStatuses]),
          ),
        );

      const totalRevenue = Number(revenueRow?.totalRevenue ?? 0);
      const orderCount = Number(revenueRow?.orderCount ?? 0);

      const [pendingRow] = await ctx.db
        .select({ pendingOrders: count() })
        .from(storeOrders)
        .where(
          and(
            gte(storeOrders.createdAt, since),
            sql`${storeOrders.status} = 'pending'`,
          ),
        );

      return {
        totalRevenue,
        orderCount,
        averageOrderValue: orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0,
        pendingOrders: Number(pendingRow?.pendingOrders ?? 0),
      };
    }),

  /**
   * Daily revenue chart data for the given period.
   */
  revenueOverTime: proc
    .input(daysInput)
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const rows = await ctx.db
        .select({
          date: sql<string>`to_char(${storeOrders.createdAt}, 'YYYY-MM-DD')`,
          revenue: sum(storeOrders.totalCents),
          count: count(),
        })
        .from(storeOrders)
        .where(
          and(
            gte(storeOrders.createdAt, since),
            inArray(storeOrders.status, [...paidStatuses]),
          ),
        )
        .groupBy(sql`to_char(${storeOrders.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${storeOrders.createdAt}, 'YYYY-MM-DD')`)
        .limit(365);

      return rows.map((r) => ({
        date: r.date,
        revenue: Number(r.revenue ?? 0),
        count: Number(r.count ?? 0),
      }));
    }),

  /**
   * Best-selling products by units sold and revenue.
   */
  topProducts: proc
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(30),
        limit: z.number().int().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const rows = await ctx.db
        .select({
          productId: storeOrderItems.productId,
          productName: storeOrderItems.productName,
          unitsSold: sum(storeOrderItems.quantity),
          revenue: sum(storeOrderItems.totalCents),
        })
        .from(storeOrderItems)
        .innerJoin(storeOrders, sql`${storeOrderItems.orderId} = ${storeOrders.id}`)
        .where(
          and(
            gte(storeOrders.createdAt, since),
            inArray(storeOrders.status, [...paidStatuses]),
          ),
        )
        .groupBy(storeOrderItems.productId, storeOrderItems.productName)
        .orderBy(desc(sum(storeOrderItems.totalCents)))
        .limit(input.limit);

      return rows.map((r) => ({
        productId: r.productId,
        productName: r.productName,
        unitsSold: Number(r.unitsSold ?? 0),
        revenue: Number(r.revenue ?? 0),
      }));
    }),

  /**
   * Order count grouped by status (donut chart data).
   */
  ordersByStatus: proc
    .input(daysInput)
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const rows = await ctx.db
        .select({
          status: storeOrders.status,
          count: count(),
        })
        .from(storeOrders)
        .where(gte(storeOrders.createdAt, since))
        .groupBy(storeOrders.status)
        .limit(20);

      return rows.map((r) => ({
        status: r.status,
        count: Number(r.count ?? 0),
      }));
    }),
});
