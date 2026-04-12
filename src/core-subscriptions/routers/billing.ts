import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, sql, gte, lte, inArray } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, sectionProcedure } from '@/server/trpc';
import { getSubscription } from '@/core-subscriptions/lib/subscription-service';
import {
  validateCode,
  applyDiscount,
  removeDiscount,
  getActiveDiscount,
} from '@/core-subscriptions/lib/discount-service';
import { getSubscriptionsDeps } from '@/core-subscriptions/deps';
import { member } from '@/server/db/schema/organization';
import {
  saasSubscriptions,
  saasDiscountCodes,
} from '@/core-subscriptions/schema/subscriptions';
import { organization } from '@/server/db/schema/organization';
import { getStats as getCachedStats } from '@/core/lib/infra/stats-cache';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { user as _user } from '@/server/db/schema/auth';
import {
  getTokenBalanceRecord,
  addTokens,
  deductTokens,
  getTokenTransactions,
} from '@/core-subscriptions/lib/token-service';

const billingAdminProcedure = sectionProcedure('billing');

export const billingRouter = createTRPCRouter({
  getPlans: protectedProcedure.query(() => {
    return getSubscriptionsDeps().getPlans().map(({ providerPrices: _pp, ...plan }) => plan);
  }),

  getProviders: protectedProcedure.query(() => {
    return getSubscriptionsDeps().getEnabledProviders?.() ?? [];
  }),

  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getSubscriptionsDeps().resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
    const sub = await getSubscription(orgId);
    if (!sub) return { planId: 'free', status: 'active' as const };
    return sub;
  }),

  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        planId: z.string().min(1).max(50),
        interval: z.enum(['monthly', 'yearly']),
        providerId: z.string().min(1).max(50).default('stripe'),
        discountCode: z.string().max(50).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!getSubscriptionsDeps().isBillingEnabled?.()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Billing is not configured',
        });
      }

      const provider = await getSubscriptionsDeps().getProvider?.(input.providerId) ?? null;
      if (!provider) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Payment provider "${input.providerId}" is not available`,
        });
      }

      // Check interval is allowed for this provider
      if (provider.config.allowedIntervals && !provider.config.allowedIntervals.includes(input.interval)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${provider.config.name} only supports ${provider.config.allowedIntervals.join(', ')} billing`,
        });
      }

      const orgId = await getSubscriptionsDeps().resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      // Verify user is owner or admin of org
      const [memberRecord] = await ctx.db
        .select()
        .from(member)
        .where(
          and(eq(member.organizationId, orgId), eq(member.userId, ctx.session.user.id))
        )
        .limit(1);

      if (!memberRecord || !['owner', 'admin'].includes(memberRecord.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only org owners/admins can manage billing',
        });
      }

      const plan = getSubscriptionsDeps().getPlan(input.planId);
      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      }

      const originalPriceCents = input.interval === 'yearly' ? plan.priceYearly : plan.priceMonthly;
      let resolvedDiscount: import('@/core-payments/types/payment').DiscountDefinition | undefined;
      let finalPriceCents: number | undefined;

      // Validate discount code if provided
      let discountUsageId: string | undefined;
      let discountCodeId: string | undefined;
      if (input.discountCode) {
        const validation = await validateCode(
          input.discountCode,
          ctx.session.user.id,
          input.planId,
          originalPriceCents,
        );
        if (!validation.valid) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: validation.message ?? 'Invalid discount code' });
        }
        // Apply the discount (creates usage record)
        const applied = await applyDiscount(input.discountCode, ctx.session.user.id, input.planId);
        resolvedDiscount = applied.discount;
        discountUsageId = applied.usageId;
        discountCodeId = applied.discountCodeId;
        finalPriceCents = validation.finalPriceCents ?? undefined;
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

      const result = await provider.createCheckout({
        organizationId: orgId,
        planId: input.planId,
        interval: input.interval,
        successUrl: `${appUrl}/dashboard/settings/billing?success=true`,
        cancelUrl: `${appUrl}/dashboard/settings/billing?canceled=true`,
        discount: resolvedDiscount,
        originalPriceCents,
        finalPriceCents,
        metadata: {
          userId: ctx.session.user.id,
          ...(input.discountCode && { discountCode: input.discountCode }),
          ...(discountUsageId && { discountUsageId }),
          ...(discountCodeId && { discountCodeId }),
        },
      });

      return { url: result.url, providerId: result.providerId };
    }),

  createPortalSession: protectedProcedure
    .input(
      z.object({
        providerId: z.string().min(1).max(50).default('stripe'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const provider = await getSubscriptionsDeps().getProvider?.(input.providerId) ?? null;
      if (!provider?.createPortalSession) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Portal session not supported for this provider',
        });
      }

      const orgId = await getSubscriptionsDeps().resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      const url = await provider.createPortalSession(
        orgId,
        `${appUrl}/dashboard/settings/billing`
      );
      return { url };
    }),

  // ─── Discount Code mutations (customer-facing) ───────────────────────────

  applyDiscountCode: protectedProcedure
    .input(z.object({
      code: z.string().min(1).max(50),
      planId: z.string().min(1).max(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const plan = getSubscriptionsDeps().getPlan(input.planId);
      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      }

      const validation = await validateCode(
        input.code,
        ctx.session.user.id,
        input.planId,
        plan.priceYearly,
      );

      if (!validation.valid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: validation.message ?? 'Invalid discount code' });
      }

      const { discount } = await applyDiscount(input.code, ctx.session.user.id, input.planId);
      return { discount, finalPriceCents: validation.finalPriceCents };
    }),

  removeDiscountCode: protectedProcedure.mutation(async ({ ctx }) => {
    await removeDiscount(ctx.session.user.id);
    return { success: true };
  }),

  getActiveDiscount: protectedProcedure.query(async ({ ctx }) => {
    return await getActiveDiscount(ctx.session.user.id);
  }),

  // ─── Renewal ──────────────────────────────────────────────────────────────

  /** Renew an expired or past_due subscription — creates new checkout */
  renewSubscription: protectedProcedure
    .input(
      z.object({
        planId: z.string().min(1).max(50),
        interval: z.enum(['monthly', 'yearly']),
        providerId: z.string().min(1).max(50).default('stripe'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!getSubscriptionsDeps().isBillingEnabled?.()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Billing is not configured',
        });
      }

      const orgId = await getSubscriptionsDeps().resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      // Verify user is owner or admin of org
      const [memberRecord] = await ctx.db
        .select()
        .from(member)
        .where(
          and(eq(member.organizationId, orgId), eq(member.userId, ctx.session.user.id))
        )
        .limit(1);

      if (!memberRecord || !['owner', 'admin'].includes(memberRecord.role)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only org owners/admins can manage billing',
        });
      }

      const provider = await getSubscriptionsDeps().getProvider?.(input.providerId) ?? null;
      if (!provider) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Payment provider "${input.providerId}" is not available`,
        });
      }

      const plan = getSubscriptionsDeps().getPlan(input.planId);
      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found' });
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

      const result = await provider.createCheckout({
        organizationId: orgId,
        planId: input.planId,
        interval: input.interval,
        successUrl: `${appUrl}/dashboard/settings/billing?success=true`,
        cancelUrl: `${appUrl}/dashboard/settings/billing?canceled=true`,
        metadata: { userId: ctx.session.user.id, renewal: 'true' },
      });

      return { url: result.url, providerId: result.providerId };
    }),

  // ─── Admin billing stats ─────────────────────────────────────────────────

  getStats: billingAdminProcedure
    .input(
      z.object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const from = input?.from;
      const to = input?.to;
      const cacheKey = `billing:stats:${from ?? 'all'}:${to ?? 'all'}`;

      return getCachedStats(cacheKey, async () => {
        const dateConditions = [];
        if (from) dateConditions.push(gte(saasSubscriptions.createdAt, new Date(from)));
        if (to) dateConditions.push(lte(saasSubscriptions.createdAt, new Date(to)));

        // Active subscriptions by plan
        const planDistribution = await ctx.db
          .select({
            planId: saasSubscriptions.planId,
            count: sql<number>`count(*)`.as('count'),
          })
          .from(saasSubscriptions)
          .where(and(eq(saasSubscriptions.status, 'active'), ...dateConditions))
          .groupBy(saasSubscriptions.planId);

        const totalActive = planDistribution.reduce((sum, p) => sum + Number(p.count), 0);

        // MRR calculation — group by plan+provider+priceId to avoid fetching individual rows
        const activeSubGroups = await ctx.db
          .select({
            planId: saasSubscriptions.planId,
            providerId: saasSubscriptions.providerId,
            providerPriceId: saasSubscriptions.providerPriceId,
            count: sql<number>`count(*)`.as('count'),
          })
          .from(saasSubscriptions)
          .where(eq(saasSubscriptions.status, 'active'))
          .groupBy(
            saasSubscriptions.planId,
            saasSubscriptions.providerId,
            saasSubscriptions.providerPriceId,
          );

        let mrr = 0;
        for (const group of activeSubGroups) {
          const plan = getSubscriptionsDeps().getPlan(group.planId);
          if (!plan) continue;
          let isYearly = false;
          if (group.providerPriceId && group.providerId) {
            const prices = plan.providerPrices[group.providerId];
            if (prices) isYearly = prices.yearly === group.providerPriceId;
          }
          if (group.providerId === 'nowpayments') isYearly = true;
          const centsPerSub = isYearly
            ? Math.round(plan.priceYearly / 12)
            : plan.priceMonthly;
          mrr += centsPerSub * Number(group.count);
        }

        // Trialing
        const [trialingResult] = await ctx.db
          .select({ count: sql<number>`count(*)`.as('count') })
          .from(saasSubscriptions)
          .where(eq(saasSubscriptions.status, 'trialing'));

        // Churn metrics
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [canceledResult] = await ctx.db
          .select({ count: sql<number>`count(*)`.as('count') })
          .from(saasSubscriptions)
          .where(and(eq(saasSubscriptions.status, 'canceled'), gte(saasSubscriptions.updatedAt, thirtyDaysAgo)));

        const [pastDueResult] = await ctx.db
          .select({ count: sql<number>`count(*)`.as('count') })
          .from(saasSubscriptions)
          .where(eq(saasSubscriptions.status, 'past_due'));

        const [unpaidResult] = await ctx.db
          .select({ count: sql<number>`count(*)`.as('count') })
          .from(saasSubscriptions)
          .where(eq(saasSubscriptions.status, 'unpaid'));

        const [totalEverResult] = await ctx.db
          .select({ count: sql<number>`count(*)`.as('count') })
          .from(saasSubscriptions);

        const totalEver = Number(totalEverResult?.count ?? 0);
        const canceledCount = Number(canceledResult?.count ?? 0);
        const churnRate = totalEver > 0 ? Math.round((canceledCount / totalEver) * 10000) / 100 : 0;

        // Total revenue (via DI — provided by core-payments)
        const deps = getSubscriptionsDeps();
        const totalRevenueValue = await deps.getTransactionRevenue?.('successful') ?? 0;

        // Recent transactions with org names (via DI — provided by core-payments)
        const recentTransactions = await deps.getRecentTransactions?.(10) ?? [];

        // Active discount codes count
        const [discountResult] = await ctx.db
          .select({ count: sql<number>`count(*)`.as('count') })
          .from(saasDiscountCodes)
          .where(eq(saasDiscountCodes.isActive, true));

        return {
          totalActive,
          mrr,
          trialing: Number(trialingResult?.count ?? 0),
          planDistribution: planDistribution.map((p) => ({ planId: p.planId, count: Number(p.count) })),
          churn: {
            canceled30d: canceledCount,
            pastDue: Number(pastDueResult?.count ?? 0),
            unpaid: Number(unpaidResult?.count ?? 0),
            totalEver,
            churnRate,
          },
          totalRevenue: totalRevenueValue,
          recentTransactions,
          activeDiscountCodes: Number(discountResult?.count ?? 0),
        };
      }, 120);
    }),

  // ─── Admin: list subscriptions ──────────────────────────────────────────────

  listSubscriptions: billingAdminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(10).max(100).default(20),
        status: z.string().max(30).optional(),
        planId: z.string().max(50).optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        search: z.string().max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize } = parsePagination(input);
      const conditions = [];

      if (input.status) {
        conditions.push(eq(saasSubscriptions.status, input.status));
      }
      if (input.planId) {
        conditions.push(eq(saasSubscriptions.planId, input.planId));
      }
      if (input.from) {
        conditions.push(gte(saasSubscriptions.createdAt, new Date(input.from)));
      }
      if (input.to) {
        conditions.push(lte(saasSubscriptions.createdAt, new Date(input.to)));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      // If searching, find matching org IDs first
      let orgIdFilter: string[] | undefined;
      if (input.search && input.search.trim()) {
        const matchingOrgs = await ctx.db
          .select({ id: organization.id })
          .from(organization)
          .where(sql`lower(${organization.name}) like lower(${'%' + input.search.trim() + '%'})`)
          .limit(100);
        orgIdFilter = matchingOrgs.map((o) => o.id);
        if (orgIdFilter.length === 0) {
          return paginatedResult([], 0, page, pageSize);
        }
      }

      const searchCondition = orgIdFilter
        ? and(where, inArray(saasSubscriptions.organizationId, orgIdFilter))
        : where;

      const [countResult] = await ctx.db
        .select({ count: sql<number>`count(*)`.as('count') })
        .from(saasSubscriptions)
        .where(searchCondition);

      const total = Number(countResult?.count ?? 0);

      const rows = await ctx.db
        .select({
          id: saasSubscriptions.id,
          organizationId: saasSubscriptions.organizationId,
          orgName: organization.name,
          orgSlug: organization.slug,
          providerId: saasSubscriptions.providerId,
          planId: saasSubscriptions.planId,
          status: saasSubscriptions.status,
          providerPriceId: saasSubscriptions.providerPriceId,
          currentPeriodStart: saasSubscriptions.currentPeriodStart,
          currentPeriodEnd: saasSubscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: saasSubscriptions.cancelAtPeriodEnd,
          trialEnd: saasSubscriptions.trialEnd,
          createdAt: saasSubscriptions.createdAt,
        })
        .from(saasSubscriptions)
        .leftJoin(organization, eq(saasSubscriptions.organizationId, organization.id))
        .where(searchCondition)
        .orderBy(desc(saasSubscriptions.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return paginatedResult(rows, total, page, pageSize);
    }),

  // ─── Admin: churned subscriptions ──────────────────────────────────────────

  listChurned: billingAdminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(10).max(100).default(20),
        type: z.enum(['all', 'canceled', 'past_due', 'unpaid']).default('all'),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        search: z.string().max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize } = parsePagination(input);
      const churnStatuses = input.type === 'all'
        ? ['canceled', 'past_due', 'unpaid']
        : [input.type];

      const conditions = [
        inArray(saasSubscriptions.status, churnStatuses),
      ];

      if (input.from) {
        conditions.push(gte(saasSubscriptions.updatedAt, new Date(input.from)));
      }
      if (input.to) {
        conditions.push(lte(saasSubscriptions.updatedAt, new Date(input.to)));
      }

      let orgIdFilter: string[] | undefined;
      if (input.search?.trim()) {
        const matchingOrgs = await ctx.db
          .select({ id: organization.id })
          .from(organization)
          .where(sql`lower(${organization.name}) like lower(${'%' + input.search.trim() + '%'})`)
          .limit(100);
        orgIdFilter = matchingOrgs.map((o) => o.id);
        if (orgIdFilter.length === 0) {
          return { ...paginatedResult([], 0, page, pageSize), typeCounts: { canceled: 0, past_due: 0, unpaid: 0 } };
        }
      }

      const searchCondition = orgIdFilter
        ? and(...conditions, inArray(saasSubscriptions.organizationId, orgIdFilter))
        : and(...conditions);

      // Run list, count, and type counts in parallel
      const baseConditions = [];
      if (input.from) baseConditions.push(gte(saasSubscriptions.updatedAt, new Date(input.from)));
      if (input.to) baseConditions.push(lte(saasSubscriptions.updatedAt, new Date(input.to)));
      if (orgIdFilter) baseConditions.push(inArray(saasSubscriptions.organizationId, orgIdFilter));

      const [countResult, rows, typeCountRows] = await Promise.all([
        ctx.db
          .select({ count: sql<number>`count(*)`.as('count') })
          .from(saasSubscriptions)
          .where(searchCondition)
          .then((r) => r[0]),

        ctx.db
          .select({
            id: saasSubscriptions.id,
            organizationId: saasSubscriptions.organizationId,
            orgName: organization.name,
            planId: saasSubscriptions.planId,
            status: saasSubscriptions.status,
            providerId: saasSubscriptions.providerId,
            cancelAtPeriodEnd: saasSubscriptions.cancelAtPeriodEnd,
            currentPeriodEnd: saasSubscriptions.currentPeriodEnd,
            createdAt: saasSubscriptions.createdAt,
            updatedAt: saasSubscriptions.updatedAt,
          })
          .from(saasSubscriptions)
          .leftJoin(organization, eq(saasSubscriptions.organizationId, organization.id))
          .where(searchCondition)
          .orderBy(desc(saasSubscriptions.updatedAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),

        ctx.db
          .select({
            status: saasSubscriptions.status,
            count: sql<number>`count(*)`.as('count'),
          })
          .from(saasSubscriptions)
          .where(
            and(
              inArray(saasSubscriptions.status, ['canceled', 'past_due', 'unpaid']),
              ...baseConditions,
            )
          )
          .groupBy(saasSubscriptions.status),
      ]);

      const typeCounts = { canceled: 0, past_due: 0, unpaid: 0 };
      for (const row of typeCountRows) {
        if (row.status in typeCounts) {
          typeCounts[row.status as keyof typeof typeCounts] = Number(row.count);
        }
      }

      return {
        ...paginatedResult(rows, Number(countResult?.count ?? 0), page, pageSize),
        typeCounts,
      };
    }),

  // ─── Admin: discount codes with usage stats ────────────────────────────────

  listDiscountCodes: billingAdminProcedure.query(async ({ ctx }) => {
    const codes = await ctx.db
      .select()
      .from(saasDiscountCodes)
      .orderBy(desc(saasDiscountCodes.createdAt))
      .limit(200);

    return codes.map((c) => ({
      id: c.id,
      code: c.code,
      isActive: c.isActive,
      discountType: c.discountType,
      discountValue: c.discountValue,
      trialDays: c.trialDays,
      maxUses: c.maxUses,
      currentUses: c.currentUses,
      validFrom: c.validFrom,
      validUntil: c.validUntil,
      createdAt: c.createdAt,
    }));
  }),

  // ─── Admin: revenue over time ──────────────────────────────────────────────

  revenueOverTime: billingAdminProcedure
    .input(
      z.object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
    )
    .query(async ({ input }) => {
      // Revenue over time (via DI — provided by core-payments)
      return await getSubscriptionsDeps().getRevenueOverTime?.(input.from, input.to) ?? [];
    }),

  // ─── Token balance (customer-facing) ────────────────────────────────────

  getTokenBalance: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getSubscriptionsDeps().resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
    const record = await getTokenBalanceRecord(orgId);
    return {
      orgId,
      balance: record?.balance ?? 0,
      lifetimeAdded: record?.lifetimeAdded ?? 0,
      lifetimeUsed: record?.lifetimeUsed ?? 0,
    };
  }),

  getTokenTransactions: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const orgId = await getSubscriptionsDeps().resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      return getTokenTransactions(orgId, input.limit);
    }),

  // ─── Token admin mutations ──────────────────────────────────────────────

  addTokens: billingAdminProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      amount: z.number().int().min(1).max(1_000_000),
      reason: z.string().min(1).max(100),
    }))
    .mutation(async ({ input }) => {
      const balance = await addTokens(input.organizationId, input.amount, input.reason);
      return { balance };
    }),

  deductTokens: billingAdminProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      amount: z.number().int().min(1).max(1_000_000),
      reason: z.string().min(1).max(100),
    }))
    .mutation(async ({ input }) => {
      try {
        const balance = await deductTokens(input.organizationId, input.amount, input.reason);
        return { balance };
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: err instanceof Error ? err.message : 'Failed to deduct tokens',
        });
      }
    }),
});
