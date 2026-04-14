import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { storeAddresses } from '@/core-store/schema/orders';
import { resolveOrgId } from '@/server/lib/resolve-org';

const addressInput = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  company: z.string().max(255).optional(),
  address1: z.string().min(1).max(255),
  address2: z.string().max(255).optional(),
  city: z.string().min(1).max(100),
  state: z.string().max(100).optional(),
  postalCode: z.string().min(1).max(20),
  country: z.string().length(2),
  phone: z.string().max(30).optional(),
  isDefault: z.boolean().default(false),
});

export const storeAddressesRouter = createTRPCRouter({
  /** List shipping addresses for the user's active organization. */
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      return ctx.db
        .select()
        .from(storeAddresses)
        .where(eq(storeAddresses.organizationId, orgId))
        .limit(50);
    }),

  /** Create a new shipping address. */
  create: protectedProcedure
    .input(addressInput)
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      // If this is the new default, unset other defaults
      if (input.isDefault) {
        await ctx.db.update(storeAddresses)
          .set({ isDefault: false })
          .where(eq(storeAddresses.organizationId, orgId));
      }

      const [addr] = await ctx.db.insert(storeAddresses).values({
        organizationId: orgId,
        createdByUserId: ctx.session.user.id,
        firstName: input.firstName,
        lastName: input.lastName,
        company: input.company ?? null,
        address1: input.address1,
        address2: input.address2 ?? null,
        city: input.city,
        state: input.state ?? null,
        postalCode: input.postalCode,
        country: input.country,
        phone: input.phone ?? null,
        isDefault: input.isDefault,
      }).returning({ id: storeAddresses.id });

      return { id: addr!.id };
    }),

  /** Update an existing shipping address. */
  update: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).merge(addressInput))
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      // Verify ownership
      const [existing] = await ctx.db
        .select({ id: storeAddresses.id })
        .from(storeAddresses)
        .where(and(eq(storeAddresses.id, input.id), eq(storeAddresses.organizationId, orgId)))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Address not found' });
      }

      if (input.isDefault) {
        await ctx.db.update(storeAddresses)
          .set({ isDefault: false })
          .where(eq(storeAddresses.organizationId, orgId));
      }

      await ctx.db.update(storeAddresses)
        .set({
          firstName: input.firstName,
          lastName: input.lastName,
          company: input.company ?? null,
          address1: input.address1,
          address2: input.address2 ?? null,
          city: input.city,
          state: input.state ?? null,
          postalCode: input.postalCode,
          country: input.country,
          phone: input.phone ?? null,
          isDefault: input.isDefault,
          updatedAt: new Date(),
        })
        .where(eq(storeAddresses.id, input.id));

      return { success: true };
    }),

  /** Delete a shipping address. */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      const result = await ctx.db.delete(storeAddresses)
        .where(and(eq(storeAddresses.id, input.id), eq(storeAddresses.organizationId, orgId)));

      return { success: true };
    }),

  /** Set an address as the default. */
  setDefault: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      // Verify ownership
      const [existing] = await ctx.db
        .select({ id: storeAddresses.id })
        .from(storeAddresses)
        .where(and(eq(storeAddresses.id, input.id), eq(storeAddresses.organizationId, orgId)))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Address not found' });
      }

      // Unset all defaults, then set this one
      await ctx.db.update(storeAddresses)
        .set({ isDefault: false })
        .where(eq(storeAddresses.organizationId, orgId));

      await ctx.db.update(storeAddresses)
        .set({ isDefault: true })
        .where(eq(storeAddresses.id, input.id));

      return { success: true };
    }),
});
