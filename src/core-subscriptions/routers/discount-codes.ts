import { z } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, sectionProcedure } from '@/server/trpc';
import { saasDiscountCodes, saasDiscountUsages } from '@/core-subscriptions/schema/subscriptions';
import { DiscountType } from '@/core-payments/types/payment';

const billingProcedure = sectionProcedure('billing');

const discountCodeInput = z.object({
  code: z.string().min(1).max(50).transform((v) => v.toUpperCase()),
  isActive: z.boolean().default(true),
  discountType: z.nativeEnum(DiscountType),
  discountValue: z.number().int().min(0).max(100_000_00).nullable().default(null),
  trialDays: z.number().int().min(1).max(365).nullable().default(null),
  trialPriceCents: z.number().int().min(0).nullable().default(null),
  planSpecificDiscounts: z.record(z.string(), z.object({
    type: z.nativeEnum(DiscountType),
    value: z.number().optional(),
    trialDays: z.number().optional(),
    trialPriceCents: z.number().optional(),
  })).nullable().default(null),
  maxUses: z.number().int().min(1).nullable().default(null),
  maxUsesPerUser: z.number().int().min(1).max(100).default(1),
  validFrom: z.coerce.date().nullable().default(null),
  validUntil: z.coerce.date().nullable().default(null),
  timeLimitHours: z.number().int().min(1).max(8760).nullable().default(null),
});

export const discountCodesRouter = createTRPCRouter({
  list: billingProcedure.query(async ({ ctx }) => {
    const codes = await ctx.db
      .select()
      .from(saasDiscountCodes)
      .orderBy(desc(saasDiscountCodes.createdAt))
      .limit(100);

    return codes;
  }),

  get: billingProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [code] = await ctx.db
        .select()
        .from(saasDiscountCodes)
        .where(eq(saasDiscountCodes.id, input.id))
        .limit(1);

      if (!code) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Discount code not found' });
      }
      return code;
    }),

  create: billingProcedure
    .input(discountCodeInput)
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: saasDiscountCodes.id })
        .from(saasDiscountCodes)
        .where(eq(saasDiscountCodes.code, input.code))
        .limit(1);

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'A discount code with this code already exists' });
      }

      const [code] = await ctx.db
        .insert(saasDiscountCodes)
        .values(input)
        .returning();

      return code;
    }),

  update: billingProcedure
    .input(z.object({ id: z.string().uuid() }).merge(discountCodeInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const [code] = await ctx.db
        .update(saasDiscountCodes)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(saasDiscountCodes.id, id))
        .returning();

      if (!code) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Discount code not found' });
      }
      return code;
    }),

  delete: billingProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(saasDiscountCodes).where(eq(saasDiscountCodes.id, input.id));
      return { success: true };
    }),

  getUsageStats: billingProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [stats] = await ctx.db
        .select({
          totalUses: sql<number>`count(*)`.as('total_uses'),
          completedUses: sql<number>`count(${saasDiscountUsages.usedAt})`.as('completed_uses'),
          uniqueUsers: sql<number>`count(distinct ${saasDiscountUsages.userId})`.as('unique_users'),
        })
        .from(saasDiscountUsages)
        .where(eq(saasDiscountUsages.discountCodeId, input.id));

      return stats ?? { totalUses: 0, completedUses: 0, uniqueUsers: 0 };
    }),
});
