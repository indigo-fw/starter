import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, ilike } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, sectionProcedure } from '@/server/trpc';
import { storeDiscountCodes, storeDiscountUsage } from '@/core-store/schema/discount-codes';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { validateDiscount } from '@/core-store/lib/discount-service';

const storeAdminProcedure = sectionProcedure('settings');

export const storeDiscountsRouter = createTRPCRouter({
  // ─── Admin ──────────────────────────────────────────────────────────────

  /** List all discount codes (admin) */
  adminList: storeAdminProcedure
    .input(z.object({
      search: z.string().max(200).optional(),
      isActive: z.boolean().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [];
      if (input.isActive !== undefined) {
        conditions.push(eq(storeDiscountCodes.isActive, input.isActive));
      }
      if (input.search) {
        conditions.push(ilike(storeDiscountCodes.code, `%${input.search}%`));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select()
          .from(storeDiscountCodes)
          .where(where)
          .orderBy(desc(storeDiscountCodes.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(storeDiscountCodes).where(where),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Create a new discount code (admin) */
  create: storeAdminProcedure
    .input(z.object({
      code: z.string().min(1).max(50),
      type: z.enum(['percentage', 'fixed_amount']),
      value: z.number().int().min(1),
      currency: z.string().length(3).default('EUR'),
      minOrderCents: z.number().int().min(0).optional(),
      maxDiscountCents: z.number().int().min(0).optional(),
      maxUses: z.number().int().min(1).optional(),
      maxUsesPerUser: z.number().int().min(1).optional(),
      startsAt: z.string().datetime().optional(),
      expiresAt: z.string().datetime().optional(),
      appliesToCategories: z.array(z.string().uuid()).max(100).optional(),
      appliesToProducts: z.array(z.string().uuid()).max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const code = input.code.trim().toUpperCase();

      // Check for duplicate code
      const [existing] = await ctx.db
        .select({ id: storeDiscountCodes.id })
        .from(storeDiscountCodes)
        .where(eq(storeDiscountCodes.code, code))
        .limit(1);

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: `Discount code "${code}" already exists` });
      }

      // Validate percentage is <= 100
      if (input.type === 'percentage' && input.value > 100) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Percentage discount cannot exceed 100%' });
      }

      const id = crypto.randomUUID();

      await ctx.db.insert(storeDiscountCodes).values({
        id,
        code,
        type: input.type,
        value: input.value,
        currency: input.currency,
        minOrderCents: input.minOrderCents ?? null,
        maxDiscountCents: input.maxDiscountCents ?? null,
        maxUses: input.maxUses ?? null,
        maxUsesPerUser: input.maxUsesPerUser ?? null,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        appliesToCategories: input.appliesToCategories ?? null,
        appliesToProducts: input.appliesToProducts ?? null,
      });

      return { id, code };
    }),

  /** Update a discount code (admin) */
  update: storeAdminProcedure
    .input(z.object({
      id: z.string().uuid(),
      code: z.string().min(1).max(50).optional(),
      type: z.enum(['percentage', 'fixed_amount']).optional(),
      value: z.number().int().min(1).optional(),
      currency: z.string().length(3).optional(),
      minOrderCents: z.number().int().min(0).nullable().optional(),
      maxDiscountCents: z.number().int().min(0).nullable().optional(),
      maxUses: z.number().int().min(1).nullable().optional(),
      maxUsesPerUser: z.number().int().min(1).nullable().optional(),
      startsAt: z.string().datetime().nullable().optional(),
      expiresAt: z.string().datetime().nullable().optional(),
      isActive: z.boolean().optional(),
      appliesToCategories: z.array(z.string().uuid()).max(100).nullable().optional(),
      appliesToProducts: z.array(z.string().uuid()).max(100).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;

      // Verify exists
      const [existing] = await ctx.db
        .select({ id: storeDiscountCodes.id })
        .from(storeDiscountCodes)
        .where(eq(storeDiscountCodes.id, id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Discount code not found' });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (fields.code !== undefined) {
        const newCode = fields.code.trim().toUpperCase();
        // Check for duplicate if code is changing
        const [dup] = await ctx.db
          .select({ id: storeDiscountCodes.id })
          .from(storeDiscountCodes)
          .where(and(eq(storeDiscountCodes.code, newCode)))
          .limit(1);

        if (dup && dup.id !== id) {
          throw new TRPCError({ code: 'CONFLICT', message: `Discount code "${newCode}" already exists` });
        }
        updates.code = newCode;
      }

      if (fields.type !== undefined) updates.type = fields.type;
      if (fields.value !== undefined) {
        if (fields.type === 'percentage' && fields.value > 100) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Percentage discount cannot exceed 100%' });
        }
        updates.value = fields.value;
      }
      if (fields.currency !== undefined) updates.currency = fields.currency;
      if (fields.minOrderCents !== undefined) updates.minOrderCents = fields.minOrderCents;
      if (fields.maxDiscountCents !== undefined) updates.maxDiscountCents = fields.maxDiscountCents;
      if (fields.maxUses !== undefined) updates.maxUses = fields.maxUses;
      if (fields.maxUsesPerUser !== undefined) updates.maxUsesPerUser = fields.maxUsesPerUser;
      if (fields.startsAt !== undefined) updates.startsAt = fields.startsAt ? new Date(fields.startsAt) : null;
      if (fields.expiresAt !== undefined) updates.expiresAt = fields.expiresAt ? new Date(fields.expiresAt) : null;
      if (fields.isActive !== undefined) updates.isActive = fields.isActive;
      if (fields.appliesToCategories !== undefined) updates.appliesToCategories = fields.appliesToCategories;
      if (fields.appliesToProducts !== undefined) updates.appliesToProducts = fields.appliesToProducts;

      await ctx.db
        .update(storeDiscountCodes)
        .set(updates)
        .where(eq(storeDiscountCodes.id, id));

      return { success: true };
    }),

  /** Delete (soft) a discount code by deactivating it (admin) */
  delete: storeAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: storeDiscountCodes.id })
        .from(storeDiscountCodes)
        .where(eq(storeDiscountCodes.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Discount code not found' });
      }

      await ctx.db
        .update(storeDiscountCodes)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(storeDiscountCodes.id, input.id));

      return { success: true };
    }),

  // ─── Public ─────────────────────────────────────────────────────────────

  /** Validate a discount code (customer-facing) */
  validate: protectedProcedure
    .input(z.object({
      code: z.string().min(1).max(50),
      subtotalCents: z.number().int().min(0),
      currency: z.string().length(3).default('EUR'),
    }))
    .query(async ({ ctx, input }) => {
      const result = await validateDiscount({
        code: input.code,
        subtotalCents: input.subtotalCents,
        userId: ctx.session.user.id,
        currency: input.currency,
      });

      return {
        valid: true as const,
        code: result.code,
        type: result.type,
        discountCents: result.discountCents,
      };
    }),
});
