import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { createTRPCRouter, sectionProcedure } from '@/server/trpc';
import { bookingServices } from '@/core-booking/schema/services';
import { bookingSchedules, bookingOverrides } from '@/core-booking/schema/availability';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { slugify } from '@/core/lib/slug';
import { resolveOrgId } from '@/server/lib/resolve-org';

const bookingAdminProcedure = sectionProcedure('settings');

export const bookingServicesRouter = createTRPCRouter({
  // ─── Admin: Service CRUD ────────────────────────────────────────────────

  /** List services (admin) */
  adminList: bookingAdminProcedure
    .input(z.object({
      search: z.string().max(200).optional(),
      status: z.enum(['draft', 'published', 'archived']).optional(),
      type: z.enum(['appointment', 'class', 'resource', 'event']).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [
        eq(bookingServices.organizationId, orgId),
        isNull(bookingServices.deletedAt),
      ];

      if (input.status) conditions.push(eq(bookingServices.status, input.status));
      if (input.type) conditions.push(eq(bookingServices.type, input.type));
      if (input.search) {
        conditions.push(sql`${bookingServices.name} ILIKE ${'%' + input.search + '%'}`);
      }

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: bookingServices.id,
            name: bookingServices.name,
            slug: bookingServices.slug,
            type: bookingServices.type,
            status: bookingServices.status,
            durationMinutes: bookingServices.durationMinutes,
            priceCents: bookingServices.priceCents,
            currency: bookingServices.currency,
            maxCapacity: bookingServices.maxCapacity,
            requiresApproval: bookingServices.requiresApproval,
            createdAt: bookingServices.createdAt,
          })
          .from(bookingServices)
          .where(and(...conditions))
          .orderBy(bookingServices.sortOrder, desc(bookingServices.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(bookingServices).where(and(...conditions)),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get single service (admin) */
  adminGet: bookingAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      const [service] = await ctx.db
        .select()
        .from(bookingServices)
        .where(and(eq(bookingServices.id, input.id), eq(bookingServices.organizationId, orgId)))
        .limit(1);

      if (!service) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });

      // Fetch schedules and overrides
      const [schedules, overrides] = await Promise.all([
        ctx.db.select().from(bookingSchedules)
          .where(eq(bookingSchedules.serviceId, input.id))
          .orderBy(bookingSchedules.dayOfWeek)
          .limit(50),
        ctx.db.select().from(bookingOverrides)
          .where(eq(bookingOverrides.serviceId, input.id))
          .orderBy(bookingOverrides.date)
          .limit(200),
      ]);

      return { ...service, schedules, overrides };
    }),

  /** Create service */
  create: bookingAdminProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      type: z.enum(['appointment', 'class', 'resource', 'event']).default('appointment'),
      description: z.string().max(5000).optional(),
      shortDescription: z.string().max(500).optional(),
      durationMinutes: z.number().int().min(5).max(1440).default(60),
      bufferMinutes: z.number().int().min(0).max(240).default(0),
      priceCents: z.number().int().min(0).default(0),
      currency: z.string().length(3).default('EUR'),
      maxCapacity: z.number().int().min(1).max(10000).default(1),
      requiresApproval: z.boolean().default(false),
      minAdvanceHours: z.number().int().min(0).max(8760).optional(),
      maxAdvanceHours: z.number().int().min(1).max(8760).optional(),
      cancellationDeadlineHours: z.number().int().min(0).max(720).optional(),
      location: z.string().max(500).optional(),
      timezone: z.string().max(100).default('UTC'),
      featuredImage: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      const slug = slugify(input.name);
      // Ensure unique slug within org
      const [existing] = await ctx.db
        .select({ id: bookingServices.id })
        .from(bookingServices)
        .where(and(eq(bookingServices.organizationId, orgId), eq(bookingServices.slug, slug)))
        .limit(1);

      const finalSlug = existing ? `${slug}-${Date.now()}` : slug;
      const id = crypto.randomUUID();

      await ctx.db.insert(bookingServices).values({
        id,
        organizationId: orgId,
        type: input.type,
        status: 'draft',
        name: input.name,
        slug: finalSlug,
        description: input.description ?? null,
        shortDescription: input.shortDescription ?? null,
        durationMinutes: input.durationMinutes,
        bufferMinutes: input.bufferMinutes,
        priceCents: input.priceCents,
        currency: input.currency,
        maxCapacity: input.maxCapacity,
        requiresApproval: input.requiresApproval,
        minAdvanceHours: input.minAdvanceHours ?? null,
        maxAdvanceHours: input.maxAdvanceHours ?? null,
        cancellationDeadlineHours: input.cancellationDeadlineHours ?? null,
        location: input.location ?? null,
        timezone: input.timezone,
        featuredImage: input.featuredImage ?? null,
      });

      return { id, slug: finalSlug };
    }),

  /** Update service */
  update: bookingAdminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      type: z.enum(['appointment', 'class', 'resource', 'event']).optional(),
      status: z.enum(['draft', 'published', 'archived']).optional(),
      description: z.string().max(5000).optional(),
      shortDescription: z.string().max(500).optional(),
      durationMinutes: z.number().int().min(5).max(1440).optional(),
      bufferMinutes: z.number().int().min(0).max(240).optional(),
      priceCents: z.number().int().min(0).optional(),
      currency: z.string().length(3).optional(),
      maxCapacity: z.number().int().min(1).max(10000).optional(),
      requiresApproval: z.boolean().optional(),
      minAdvanceHours: z.number().int().min(0).max(8760).nullable().optional(),
      maxAdvanceHours: z.number().int().min(1).max(8760).nullable().optional(),
      cancellationDeadlineHours: z.number().int().min(0).max(720).nullable().optional(),
      location: z.string().max(500).nullable().optional(),
      timezone: z.string().max(100).optional(),
      featuredImage: z.string().max(2000).nullable().optional(),
      sortOrder: z.number().int().min(0).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      const { id, ...updates } = input;

      // Verify ownership
      const [service] = await ctx.db
        .select({ id: bookingServices.id })
        .from(bookingServices)
        .where(and(eq(bookingServices.id, id), eq(bookingServices.organizationId, orgId)))
        .limit(1);

      if (!service) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });

      // Update slug if name changed
      const setValues: Record<string, unknown> = { ...updates, updatedAt: new Date() };
      if (updates.name) {
        const slug = slugify(updates.name);
        const [dup] = await ctx.db
          .select({ id: bookingServices.id })
          .from(bookingServices)
          .where(and(
            eq(bookingServices.organizationId, orgId),
            eq(bookingServices.slug, slug),
            sql`${bookingServices.id} != ${id}`,
          ))
          .limit(1);
        setValues.slug = dup ? `${slug}-${Date.now()}` : slug;
      }

      await ctx.db.update(bookingServices).set(setValues).where(eq(bookingServices.id, id));

      return { success: true };
    }),

  /** Soft-delete service */
  delete: bookingAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      const [service] = await ctx.db
        .select({ id: bookingServices.id })
        .from(bookingServices)
        .where(and(eq(bookingServices.id, input.id), eq(bookingServices.organizationId, orgId)))
        .limit(1);

      if (!service) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });

      await ctx.db.update(bookingServices)
        .set({ deletedAt: new Date(), status: 'archived' })
        .where(eq(bookingServices.id, input.id));

      return { success: true };
    }),
});
