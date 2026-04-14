import { z } from 'zod';
import { count, desc, eq } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, sectionProcedure } from '@/server/trpc';
import { storeReturns } from '@/core-store/schema/returns';
import { organization } from '@/server/db/schema/organization';
import {
  createReturn,
  approveReturn,
  receiveReturn,
  processReturnRefund,
  rejectReturn,
} from '@/core-store/lib/return-service';
import { getStoreDeps } from '@/core-store/deps';

const storeAdminProcedure = sectionProcedure('settings');

export const storeReturnsRouter = createTRPCRouter({
  // ─── Customer-facing ──────────────────────────────────────────────────────

  /** Request a return for items in an order */
  requestReturn: protectedProcedure
    .input(
      z.object({
        orderId: z.string().uuid(),
        items: z
          .array(
            z.object({
              orderItemId: z.string().uuid(),
              quantity: z.number().int().min(1),
              reason: z.string().max(500).optional(),
              condition: z.enum(['unopened', 'damaged', 'defective', 'wrong_item', 'other']),
            }),
          )
          .min(1)
          .max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const deps = getStoreDeps();
      const orgId = await deps.resolveOrgId(ctx.activeOrganizationId, userId);

      const returnId = await createReturn({
        orderId: input.orderId,
        organizationId: orgId,
        requestedByUserId: userId,
        items: input.items,
      });

      return { returnId };
    }),

  /** List my returns */
  getMyReturns: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const deps = getStoreDeps();
    const orgId = await deps.resolveOrgId(ctx.activeOrganizationId, userId);

    const returns = await ctx.db
      .select()
      .from(storeReturns)
      .where(eq(storeReturns.organizationId, orgId))
      .orderBy(desc(storeReturns.createdAt))
      .limit(50);

    return returns;
  }),

  // ─── Admin ────────────────────────────────────────────────────────────────

  /** List all returns with optional status filter */
  adminListReturns: storeAdminProcedure
    .input(
      z.object({
        status: z
          .enum(['requested', 'approved', 'received', 'refunded', 'rejected'])
          .optional(),
        limit: z.number().int().max(100).default(50),
        offset: z.number().int().default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = input.status ? eq(storeReturns.status, input.status) : undefined;

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: storeReturns.id,
            orderId: storeReturns.orderId,
            organizationId: storeReturns.organizationId,
            organizationName: organization.name,
            requestedByUserId: storeReturns.requestedByUserId,
            status: storeReturns.status,
            reason: storeReturns.reason,
            adminNote: storeReturns.adminNote,
            refundAmountCents: storeReturns.refundAmountCents,
            refundedAt: storeReturns.refundedAt,
            createdAt: storeReturns.createdAt,
            updatedAt: storeReturns.updatedAt,
          })
          .from(storeReturns)
          .innerJoin(organization, eq(organization.id, storeReturns.organizationId))
          .where(conditions)
          .orderBy(desc(storeReturns.createdAt))
          .offset(input.offset)
          .limit(input.limit),
        ctx.db.select({ count: count() }).from(storeReturns).where(conditions),
      ]);

      return { items, total: countRow?.count ?? 0 };
    }),

  /** Approve a return request, optionally setting a custom refund amount */
  approveReturn: storeAdminProcedure
    .input(
      z.object({
        returnId: z.string().uuid(),
        refundAmountCents: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await approveReturn(input.returnId, input.refundAmountCents);
      return { success: true };
    }),

  /** Mark a return as received, optionally restocking items */
  receiveReturn: storeAdminProcedure
    .input(
      z.object({
        returnId: z.string().uuid(),
        restock: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      await receiveReturn(input.returnId, input.restock);
      return { success: true };
    }),

  /** Process the refund for an approved return */
  processRefund: storeAdminProcedure
    .input(z.object({ returnId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const result = await processReturnRefund(input.returnId);
      return { success: true, refundId: result.refundId };
    }),

  /** Reject a return request with a reason */
  rejectReturn: storeAdminProcedure
    .input(
      z.object({
        returnId: z.string().uuid(),
        reason: z.string().max(500),
      }),
    )
    .mutation(async ({ input }) => {
      await rejectReturn(input.returnId, input.reason);
      return { success: true };
    }),
});
