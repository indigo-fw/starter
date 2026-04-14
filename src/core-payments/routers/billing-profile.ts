import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import { billingProfiles } from '@/core-payments/schema/billing-profile';
import { resolveOrgId } from '@/server/lib/resolve-org';
import { syncStripeCustomerAddress } from '@/core-payments/lib/stripe';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('billing-profile');

export const billingProfileRouter = createTRPCRouter({
  /** Get billing profile for the user's active organization. */
  get: protectedProcedure
    .query(async ({ ctx }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      const [profile] = await ctx.db
        .select()
        .from(billingProfiles)
        .where(eq(billingProfiles.organizationId, orgId))
        .limit(1);

      return profile ?? null;
    }),

  /** Create or update billing profile for the user's active organization. */
  upsert: protectedProcedure
    .input(z.object({
      legalName: z.string().min(1).max(255),
      companyRegistrationId: z.string().max(100).optional(),
      vatId: z.string().max(50).optional(),
      taxExempt: z.boolean().default(false),
      invoiceEmail: z.string().email().max(255).optional(),
      phone: z.string().max(30).optional(),
      address1: z.string().max(255).optional(),
      address2: z.string().max(255).optional(),
      city: z.string().max(100).optional(),
      state: z.string().max(100).optional(),
      postalCode: z.string().max(20).optional(),
      country: z.string().length(2).optional(),
      defaultCurrency: z.string().length(3).default('EUR'),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      const profileData = {
        legalName: input.legalName,
        companyRegistrationId: input.companyRegistrationId ?? null,
        vatId: input.vatId ?? null,
        taxExempt: input.taxExempt,
        invoiceEmail: input.invoiceEmail ?? null,
        phone: input.phone ?? null,
        address1: input.address1 ?? null,
        address2: input.address2 ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postalCode: input.postalCode ?? null,
        country: input.country ?? null,
        defaultCurrency: input.defaultCurrency,
      };

      const [existing] = await ctx.db
        .select({ id: billingProfiles.id })
        .from(billingProfiles)
        .where(eq(billingProfiles.organizationId, orgId))
        .limit(1);

      if (existing) {
        await ctx.db.update(billingProfiles)
          .set({ ...profileData, updatedAt: new Date() })
          .where(eq(billingProfiles.id, existing.id));
      } else {
        await ctx.db.insert(billingProfiles).values({
          organizationId: orgId,
          ...profileData,
        });
      }

      // Sync address to Stripe customer (fire-and-forget)
      syncStripeCustomerAddress(orgId, profileData)
        .catch((err) => logger.warn('Failed to sync billing address to Stripe', { orgId, error: String(err) }));

      return { success: true };
    }),
});
