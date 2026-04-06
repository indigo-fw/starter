import { and, count, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { saasUserAcquisitions } from '@/core-affiliates/schema/attributions';
import { user } from '@/server/db/schema/auth';
import { getAffiliatesDeps } from '@/core-affiliates/deps';

import { createTRPCRouter, sectionProcedure } from '@/server/trpc';

const billingProcedure = sectionProcedure('billing');

export const attributionsRouter = createTRPCRouter({
  // ─── Distinct values for filter dropdowns ─────────────────────────
  distinctValues: billingProcedure.query(async ({ ctx }) => {
    const [sources, mediums, campaigns, refCodes] = await Promise.all([
      ctx.db
        .selectDistinct({ value: saasUserAcquisitions.utmSource })
        .from(saasUserAcquisitions)
        .where(isNotNull(saasUserAcquisitions.utmSource))
        .orderBy(saasUserAcquisitions.utmSource)
        .limit(200),
      ctx.db
        .selectDistinct({ value: saasUserAcquisitions.utmMedium })
        .from(saasUserAcquisitions)
        .where(isNotNull(saasUserAcquisitions.utmMedium))
        .orderBy(saasUserAcquisitions.utmMedium)
        .limit(200),
      ctx.db
        .selectDistinct({ value: saasUserAcquisitions.utmCampaign })
        .from(saasUserAcquisitions)
        .where(isNotNull(saasUserAcquisitions.utmCampaign))
        .orderBy(saasUserAcquisitions.utmCampaign)
        .limit(200),
      ctx.db
        .selectDistinct({ value: saasUserAcquisitions.refCode })
        .from(saasUserAcquisitions)
        .where(isNotNull(saasUserAcquisitions.refCode))
        .orderBy(saasUserAcquisitions.refCode)
        .limit(200),
    ]);
    return {
      sources: sources.map((r) => r.value!),
      mediums: mediums.map((r) => r.value!),
      campaigns: campaigns.map((r) => r.value!),
      refCodes: refCodes.map((r) => r.value!),
    };
  }),

  // ─── Attribution breakdown by dimension ───────────────────────────
  breakdown: billingProcedure
    .input(
      z.object({
        groupBy: z
          .enum(['utm_source', 'utm_medium', 'utm_campaign', 'ref_code'])
          .default('utm_source'),
        startDate: z.string().max(10).optional(),
        endDate: z.string().max(10).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const deps = getAffiliatesDeps();
      const groupByCol =
        input.groupBy === 'utm_medium'
          ? saasUserAcquisitions.utmMedium
          : input.groupBy === 'utm_campaign'
            ? saasUserAcquisitions.utmCampaign
            : input.groupBy === 'ref_code'
              ? saasUserAcquisitions.refCode
              : saasUserAcquisitions.utmSource;

      const conditions = [isNotNull(groupByCol)];
      if (input.startDate) {
        conditions.push(gte(saasUserAcquisitions.capturedAt, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(saasUserAcquisitions.capturedAt, new Date(input.endDate + 'T23:59:59')));
      }

      const txTable = deps.paymentTransactionsTable;

      // If billing module provides payment table, include revenue data
      if (txTable) {
        const rows = await ctx.db
          .select({
            label: groupByCol,
            signups: sql<number>`COUNT(DISTINCT ${saasUserAcquisitions.userId})`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- injected table ref
            paidUsers: sql<number>`COUNT(DISTINCT CASE WHEN ${txTable.status as any} = 'succeeded' THEN ${saasUserAcquisitions.userId} END)`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            totalRevenueCents: sql<number>`COALESCE(SUM(CASE WHEN ${txTable.status as any} = 'succeeded' THEN ${txTable.amountCents as any} ELSE 0 END), 0)`,
          })
          .from(saasUserAcquisitions)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .leftJoin(txTable as any, eq((txTable as any).userId, saasUserAcquisitions.userId))
          .where(and(...conditions))
          .groupBy(groupByCol)
          .orderBy(desc(sql`COUNT(DISTINCT ${saasUserAcquisitions.userId})`))
          .limit(100);

        return rows.map((r) => {
          const signups = Number(r.signups);
          const paidUsers = Number(r.paidUsers);
          return {
            label: r.label ?? '(unknown)',
            signups,
            paidUsers,
            conversionRate: signups > 0 ? Math.round((paidUsers / signups) * 1000) / 10 : 0,
            totalRevenueCents: Number(r.totalRevenueCents),
          };
        });
      }

      // No billing — just return signup counts
      const rows = await ctx.db
        .select({
          label: groupByCol,
          signups: sql<number>`COUNT(DISTINCT ${saasUserAcquisitions.userId})`,
        })
        .from(saasUserAcquisitions)
        .where(and(...conditions))
        .groupBy(groupByCol)
        .orderBy(desc(sql`COUNT(DISTINCT ${saasUserAcquisitions.userId})`))
        .limit(100);

      return rows.map((r) => ({
        label: r.label ?? '(unknown)',
        signups: Number(r.signups),
        paidUsers: 0,
        conversionRate: 0,
        totalRevenueCents: 0,
      }));
    }),

  // ─── Paginated attribution list (for admin user list integration) ──
  list: billingProcedure
    .input(
      z.object({
        utmSource: z.string().max(255).optional(),
        utmMedium: z.string().max(255).optional(),
        utmCampaign: z.string().max(500).optional(),
        refCode: z.string().max(255).optional(),
        startDate: z.string().max(10).optional(),
        endDate: z.string().max(10).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [];
      if (input.utmSource) conditions.push(eq(saasUserAcquisitions.utmSource, input.utmSource));
      if (input.utmMedium) conditions.push(eq(saasUserAcquisitions.utmMedium, input.utmMedium));
      if (input.utmCampaign) conditions.push(eq(saasUserAcquisitions.utmCampaign, input.utmCampaign));
      if (input.refCode) conditions.push(eq(saasUserAcquisitions.refCode, input.refCode));
      if (input.startDate) conditions.push(gte(saasUserAcquisitions.capturedAt, new Date(input.startDate)));
      if (input.endDate) conditions.push(lte(saasUserAcquisitions.capturedAt, new Date(input.endDate + 'T23:59:59')));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: saasUserAcquisitions.id,
            userId: saasUserAcquisitions.userId,
            userName: user.name,
            userEmail: user.email,
            refCode: saasUserAcquisitions.refCode,
            utmSource: saasUserAcquisitions.utmSource,
            utmMedium: saasUserAcquisitions.utmMedium,
            utmCampaign: saasUserAcquisitions.utmCampaign,
            extra: saasUserAcquisitions.extra,
            capturedAt: saasUserAcquisitions.capturedAt,
          })
          .from(saasUserAcquisitions)
          .leftJoin(user, eq(user.id, saasUserAcquisitions.userId))
          .where(where)
          .orderBy(desc(saasUserAcquisitions.capturedAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(saasUserAcquisitions).where(where),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),
});
