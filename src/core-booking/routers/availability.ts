import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, eq, gte, lte } from 'drizzle-orm';
import { createTRPCRouter, publicProcedure, sectionProcedure } from '@/server/trpc';
import { bookingServices } from '@/core-booking/schema/services';
import { bookingSchedules, bookingOverrides } from '@/core-booking/schema/availability';
import { getAvailableSlots } from '@/core-booking/lib/availability-service';
import { resolveOrgId } from '@/server/lib/resolve-org';

const bookingAdminProcedure = sectionProcedure('settings');

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const bookingAvailabilityRouter = createTRPCRouter({
  // ─── Public: Get available slots ────────────────────────────────────────

  /** Get available time slots for a service on a specific date */
  getSlots: publicProcedure
    .input(z.object({
      serviceId: z.string().uuid(),
      date: z.string().regex(dateRegex, 'Must be YYYY-MM-DD'),
    }))
    .query(async ({ input }) => {
      return getAvailableSlots(input.serviceId, input.date);
    }),

  /** Get available dates for a service in a date range (which dates have slots) */
  getAvailableDates: publicProcedure
    .input(z.object({
      serviceId: z.string().uuid(),
      from: z.string().regex(dateRegex, 'Must be YYYY-MM-DD'),
      to: z.string().regex(dateRegex, 'Must be YYYY-MM-DD'),
    }))
    .query(async ({ input }) => {
      const start = new Date(input.from);
      const end = new Date(input.to);
      const maxDays = 62; // ~2 months max

      const dates: string[] = [];
      const current = new Date(start);
      let dayCount = 0;

      while (current <= end && dayCount < maxDays) {
        const dateStr = current.toISOString().slice(0, 10);
        const slots = await getAvailableSlots(input.serviceId, dateStr);
        if (slots.length > 0) {
          dates.push(dateStr);
        }
        current.setDate(current.getDate() + 1);
        dayCount++;
      }

      return dates;
    }),

  // ─── Admin: Schedule management ─────────────────────────────────────────

  /** Set weekly schedule for a service (replaces all schedules for given days) */
  setSchedule: bookingAdminProcedure
    .input(z.object({
      serviceId: z.string().uuid(),
      schedules: z.array(z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string().regex(timeRegex, 'Must be HH:MM'),
        endTime: z.string().regex(timeRegex, 'Must be HH:MM'),
        isActive: z.boolean().default(true),
      })).max(21), // max 3 per day
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      // Verify service ownership
      const [service] = await ctx.db
        .select({ id: bookingServices.id })
        .from(bookingServices)
        .where(and(eq(bookingServices.id, input.serviceId), eq(bookingServices.organizationId, orgId)))
        .limit(1);

      if (!service) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });

      // Validate times
      for (const s of input.schedules) {
        if (s.startTime >= s.endTime) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Start time must be before end time (day ${s.dayOfWeek})` });
        }
      }

      // Replace all schedules for this service
      await ctx.db.delete(bookingSchedules)
        .where(eq(bookingSchedules.serviceId, input.serviceId));

      if (input.schedules.length > 0) {
        await ctx.db.insert(bookingSchedules).values(
          input.schedules.map((s) => ({
            serviceId: input.serviceId,
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            isActive: s.isActive,
          })),
        );
      }

      return { success: true };
    }),

  /** Get schedule for a service */
  getSchedule: bookingAdminProcedure
    .input(z.object({ serviceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      const [service] = await ctx.db
        .select({ id: bookingServices.id })
        .from(bookingServices)
        .where(and(eq(bookingServices.id, input.serviceId), eq(bookingServices.organizationId, orgId)))
        .limit(1);

      if (!service) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });

      return ctx.db.select().from(bookingSchedules)
        .where(eq(bookingSchedules.serviceId, input.serviceId))
        .orderBy(bookingSchedules.dayOfWeek)
        .limit(50);
    }),

  // ─── Admin: Date overrides ──────────────────────────────────────────────

  /** Add or update a date override */
  setOverride: bookingAdminProcedure
    .input(z.object({
      serviceId: z.string().uuid(),
      date: z.string().regex(dateRegex, 'Must be YYYY-MM-DD'),
      isUnavailable: z.boolean().default(false),
      startTime: z.string().regex(timeRegex, 'Must be HH:MM').optional(),
      endTime: z.string().regex(timeRegex, 'Must be HH:MM').optional(),
      reason: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      const [service] = await ctx.db
        .select({ id: bookingServices.id })
        .from(bookingServices)
        .where(and(eq(bookingServices.id, input.serviceId), eq(bookingServices.organizationId, orgId)))
        .limit(1);

      if (!service) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });

      if (!input.isUnavailable && input.startTime && input.endTime && input.startTime >= input.endTime) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Start time must be before end time' });
      }

      // Upsert override for this date
      const [existing] = await ctx.db
        .select({ id: bookingOverrides.id })
        .from(bookingOverrides)
        .where(and(
          eq(bookingOverrides.serviceId, input.serviceId),
          eq(bookingOverrides.date, input.date),
        ))
        .limit(1);

      if (existing) {
        await ctx.db.update(bookingOverrides)
          .set({
            isUnavailable: input.isUnavailable,
            startTime: input.startTime ?? null,
            endTime: input.endTime ?? null,
            reason: input.reason ?? null,
          })
          .where(eq(bookingOverrides.id, existing.id));
      } else {
        await ctx.db.insert(bookingOverrides).values({
          serviceId: input.serviceId,
          date: input.date,
          isUnavailable: input.isUnavailable,
          startTime: input.startTime ?? null,
          endTime: input.endTime ?? null,
          reason: input.reason ?? null,
        });
      }

      return { success: true };
    }),

  /** Remove a date override */
  removeOverride: bookingAdminProcedure
    .input(z.object({
      serviceId: z.string().uuid(),
      date: z.string().regex(dateRegex, 'Must be YYYY-MM-DD'),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      const [service] = await ctx.db
        .select({ id: bookingServices.id })
        .from(bookingServices)
        .where(and(eq(bookingServices.id, input.serviceId), eq(bookingServices.organizationId, orgId)))
        .limit(1);

      if (!service) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });

      await ctx.db.delete(bookingOverrides)
        .where(and(
          eq(bookingOverrides.serviceId, input.serviceId),
          eq(bookingOverrides.date, input.date),
        ));

      return { success: true };
    }),

  /** List overrides for a service */
  listOverrides: bookingAdminProcedure
    .input(z.object({
      serviceId: z.string().uuid(),
      from: z.string().regex(dateRegex).optional(),
      to: z.string().regex(dateRegex).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      const [service] = await ctx.db
        .select({ id: bookingServices.id })
        .from(bookingServices)
        .where(and(eq(bookingServices.id, input.serviceId), eq(bookingServices.organizationId, orgId)))
        .limit(1);

      if (!service) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });

      const conditions = [eq(bookingOverrides.serviceId, input.serviceId)];

      if (input.from) {
        conditions.push(gte(bookingOverrides.date, input.from));
      }
      if (input.to) {
        conditions.push(lte(bookingOverrides.date, input.to));
      }

      return ctx.db.select().from(bookingOverrides)
        .where(and(...conditions))
        .orderBy(bookingOverrides.date)
        .limit(200);
    }),
});
