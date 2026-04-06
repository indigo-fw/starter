import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, sectionProcedure } from '@/server/trpc';
import { saasAffiliates, saasReferrals, saasAffiliateEvents } from '@/core-affiliates/schema/affiliates';
import { user } from '@/server/db/schema/auth';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { getStats as getCachedStats } from '@/core/lib/stats-cache';
import { logAudit } from '@/core/lib/audit';

function generateAffiliateCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const affiliateAdminProcedure = sectionProcedure('billing');

export const affiliatesRouter = createTRPCRouter({
  // ─── Customer (protectedProcedure) ────────────────────────────────────────

  /** Get own affiliate info (or null) */
  getMyAffiliate: protectedProcedure.query(async ({ ctx }) => {
    const [affiliate] = await ctx.db
      .select()
      .from(saasAffiliates)
      .where(eq(saasAffiliates.userId, ctx.session.user.id))
      .limit(1);

    return affiliate ?? null;
  }),

  /** Register as an affiliate */
  register: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Check if already registered
    const [existing] = await ctx.db
      .select({ id: saasAffiliates.id })
      .from(saasAffiliates)
      .where(eq(saasAffiliates.userId, userId))
      .limit(1);

    if (existing) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Already registered as affiliate' });
    }

    const code = generateAffiliateCode();
    const id = crypto.randomUUID();

    await ctx.db.insert(saasAffiliates).values({
      id,
      userId,
      code,
    });

    logAudit({
      db: ctx.db,
      userId,
      action: 'affiliate.register',
      entityType: 'affiliate',
      entityId: id,
      metadata: { code },
    });

    return { id, code };
  }),

  /** Get own referral stats */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const [affiliate] = await ctx.db
      .select()
      .from(saasAffiliates)
      .where(eq(saasAffiliates.userId, ctx.session.user.id))
      .limit(1);

    if (!affiliate) return null;

    const referrals = await ctx.db
      .select({
        id: saasReferrals.id,
        status: saasReferrals.status,
        createdAt: saasReferrals.createdAt,
        convertedAt: saasReferrals.convertedAt,
      })
      .from(saasReferrals)
      .where(eq(saasReferrals.affiliateId, affiliate.id))
      .orderBy(desc(saasReferrals.createdAt))
      .limit(100);

    const recentEvents = await ctx.db
      .select()
      .from(saasAffiliateEvents)
      .where(eq(saasAffiliateEvents.affiliateId, affiliate.id))
      .orderBy(desc(saasAffiliateEvents.createdAt))
      .limit(50);

    return {
      affiliate,
      referrals,
      recentEvents,
    };
  }),

  // ─── Admin (sectionProcedure('billing')) ──────────────────────────────────

  /** List all affiliates */
  adminList: affiliateAdminProcedure
    .input(z.object({
      status: z.enum(['active', 'suspended', 'banned']).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [];
      if (input.status) conditions.push(eq(saasAffiliates.status, input.status));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: saasAffiliates.id,
            userId: saasAffiliates.userId,
            code: saasAffiliates.code,
            commissionPercent: saasAffiliates.commissionPercent,
            status: saasAffiliates.status,
            totalReferrals: saasAffiliates.totalReferrals,
            totalEarningsCents: saasAffiliates.totalEarningsCents,
            createdAt: saasAffiliates.createdAt,
          })
          .from(saasAffiliates)
          .where(where)
          .orderBy(desc(saasAffiliates.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(saasAffiliates).where(where),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get affiliate detail + referrals + events */
  adminGet: affiliateAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [affiliate] = await ctx.db
        .select()
        .from(saasAffiliates)
        .where(eq(saasAffiliates.id, input.id))
        .limit(1);

      if (!affiliate) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Affiliate not found' });
      }

      // Get user info
      const [affiliateUser] = await ctx.db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, affiliate.userId))
        .limit(1);

      const referrals = await ctx.db
        .select()
        .from(saasReferrals)
        .where(eq(saasReferrals.affiliateId, affiliate.id))
        .orderBy(desc(saasReferrals.createdAt))
        .limit(100);

      const events = await ctx.db
        .select()
        .from(saasAffiliateEvents)
        .where(eq(saasAffiliateEvents.affiliateId, affiliate.id))
        .orderBy(desc(saasAffiliateEvents.createdAt))
        .limit(100);

      return { ...affiliate, user: affiliateUser ?? null, referrals, events };
    }),

  /** Update affiliate status */
  updateStatus: affiliateAdminProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['active', 'suspended', 'banned']),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(saasAffiliates)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(saasAffiliates.id, input.id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'affiliate.updateStatus',
        entityType: 'affiliate',
        entityId: input.id,
        metadata: { status: input.status },
      });

      return { success: true };
    }),

  /** Update commission percentage */
  updateCommission: affiliateAdminProcedure
    .input(z.object({
      id: z.string().uuid(),
      commissionPercent: z.number().int().min(0).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(saasAffiliates)
        .set({ commissionPercent: input.commissionPercent, updatedAt: new Date() })
        .where(eq(saasAffiliates.id, input.id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'affiliate.updateCommission',
        entityType: 'affiliate',
        entityId: input.id,
        metadata: { commissionPercent: input.commissionPercent },
      });

      return { success: true };
    }),

  /** Affiliate stats for admin dashboard */
  getAffiliateStats: affiliateAdminProcedure.query(async ({ ctx }) => {
    return getCachedStats('billing:affiliates', async () => {
      const [
        [activeResult],
        [totalReferralsResult],
        [convertedResult],
        [totalEarningsResult],
        topAffiliates,
      ] = await Promise.all([
        ctx.db
          .select({ count: sql<number>`count(*)`.as('count') })
          .from(saasAffiliates)
          .where(eq(saasAffiliates.status, 'active')),
        ctx.db
          .select({ count: sql<number>`coalesce(sum(${saasAffiliates.totalReferrals}), 0)`.as('count') })
          .from(saasAffiliates),
        ctx.db
          .select({ count: sql<number>`count(*)`.as('count') })
          .from(saasReferrals)
          .where(eq(saasReferrals.status, 'converted')),
        ctx.db
          .select({ total: sql<number>`coalesce(sum(${saasAffiliates.totalEarningsCents}), 0)`.as('total') })
          .from(saasAffiliates),
        ctx.db
          .select({
            id: saasAffiliates.id,
            code: saasAffiliates.code,
            userName: user.name,
            userEmail: user.email,
            commissionPercent: saasAffiliates.commissionPercent,
            totalReferrals: saasAffiliates.totalReferrals,
            totalEarningsCents: saasAffiliates.totalEarningsCents,
            status: saasAffiliates.status,
          })
          .from(saasAffiliates)
          .leftJoin(user, eq(saasAffiliates.userId, user.id))
          .where(eq(saasAffiliates.status, 'active'))
          .orderBy(desc(saasAffiliates.totalEarningsCents))
          .limit(10),
      ]);

      const totalReferrals = Number(totalReferralsResult?.count ?? 0);
      const converted = Number(convertedResult?.count ?? 0);
      const conversionRate = totalReferrals > 0
        ? Math.round((converted / totalReferrals) * 10000) / 100
        : 0;

      return {
        activeAffiliates: Number(activeResult?.count ?? 0),
        totalReferrals,
        convertedReferrals: converted,
        conversionRate,
        totalEarningsCents: Number(totalEarningsResult?.total ?? 0),
        topAffiliates,
      };
    }, 120);
  }),
});
