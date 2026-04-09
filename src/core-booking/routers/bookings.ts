import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, gte, isNull, lt, ne, sql } from 'drizzle-orm';
import { createTRPCRouter, protectedProcedure, publicProcedure, sectionProcedure } from '@/server/trpc';
import { bookings, bookingEvents } from '@/core-booking/schema/bookings';
import { bookingServices } from '@/core-booking/schema/services';
import { createBooking, cancelBooking, updateBookingStatus } from '@/core-booking/lib/booking-service';
import { isSlotAvailable } from '@/core-booking/lib/availability-service';
import { getBookingDeps } from '@/core-booking/deps';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { resolveOrgId } from '@/server/lib/resolve-org';

const bookingAdminProcedure = sectionProcedure('settings');

export const bookingBookingsRouter = createTRPCRouter({
  // ─── Public: List published services (storefront) ───────────────────────

  /** List published services for booking (public-facing) */
  listServices: publicProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      type: z.enum(['appointment', 'class', 'resource', 'event']).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [
        eq(bookingServices.organizationId, input.organizationId),
        eq(bookingServices.status, 'published'),
        isNull(bookingServices.deletedAt),
      ];

      if (input.type) conditions.push(eq(bookingServices.type, input.type));

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: bookingServices.id,
            name: bookingServices.name,
            slug: bookingServices.slug,
            type: bookingServices.type,
            shortDescription: bookingServices.shortDescription,
            durationMinutes: bookingServices.durationMinutes,
            priceCents: bookingServices.priceCents,
            currency: bookingServices.currency,
            maxCapacity: bookingServices.maxCapacity,
            location: bookingServices.location,
            featuredImage: bookingServices.featuredImage,
          })
          .from(bookingServices)
          .where(and(...conditions))
          .orderBy(bookingServices.sortOrder, bookingServices.name)
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(bookingServices).where(and(...conditions)),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get service detail by slug (public) */
  getServiceBySlug: publicProcedure
    .input(z.object({
      organizationId: z.string().uuid(),
      slug: z.string().max(255),
    }))
    .query(async ({ ctx, input }) => {
      const [service] = await ctx.db
        .select({
          id: bookingServices.id,
          name: bookingServices.name,
          slug: bookingServices.slug,
          type: bookingServices.type,
          description: bookingServices.description,
          shortDescription: bookingServices.shortDescription,
          durationMinutes: bookingServices.durationMinutes,
          bufferMinutes: bookingServices.bufferMinutes,
          priceCents: bookingServices.priceCents,
          currency: bookingServices.currency,
          maxCapacity: bookingServices.maxCapacity,
          requiresApproval: bookingServices.requiresApproval,
          cancellationDeadlineHours: bookingServices.cancellationDeadlineHours,
          location: bookingServices.location,
          timezone: bookingServices.timezone,
          featuredImage: bookingServices.featuredImage,
        })
        .from(bookingServices)
        .where(and(
          eq(bookingServices.organizationId, input.organizationId),
          eq(bookingServices.slug, input.slug),
          eq(bookingServices.status, 'published'),
          isNull(bookingServices.deletedAt),
        ))
        .limit(1);

      if (!service) throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });

      return service;
    }),

  // ─── Protected: Create booking (logged-in users) ────────────────────────

  /** Create a booking as a logged-in user */
  create: protectedProcedure
    .input(z.object({
      serviceId: z.string().uuid(),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      attendees: z.number().int().min(1).max(1000).default(1),
      customerNote: z.string().max(1000).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      return createBooking({
        organizationId: orgId,
        serviceId: input.serviceId,
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
        userId: ctx.session.user.id,
        attendees: input.attendees,
        customerNote: input.customerNote,
        metadata: input.metadata,
      });
    }),

  /** Create a guest booking (no login required) */
  createGuest: publicProcedure
    .input(z.object({
      serviceId: z.string().uuid(),
      organizationId: z.string().uuid(),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      guestName: z.string().min(1).max(255),
      guestEmail: z.string().email().max(255),
      guestPhone: z.string().max(30).optional(),
      attendees: z.number().int().min(1).max(1000).default(1),
      customerNote: z.string().max(1000).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      return createBooking({
        organizationId: input.organizationId,
        serviceId: input.serviceId,
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        guestPhone: input.guestPhone,
        attendees: input.attendees,
        customerNote: input.customerNote,
        metadata: input.metadata,
      });
    }),

  // ─── Protected: Customer booking management ─────────────────────────────

  /** List current user's bookings */
  myBookings: protectedProcedure
    .input(z.object({
      status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']).optional(),
      upcoming: z.boolean().default(false),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);
      const userId = ctx.session.user.id;

      const conditions = [eq(bookings.userId, userId)];

      if (input.status) conditions.push(eq(bookings.status, input.status));
      if (input.upcoming) conditions.push(gte(bookings.startTime, new Date()));

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: bookings.id,
            bookingNumber: bookings.bookingNumber,
            status: bookings.status,
            startTime: bookings.startTime,
            endTime: bookings.endTime,
            attendees: bookings.attendees,
            priceCents: bookings.priceCents,
            currency: bookings.currency,
            serviceSnapshot: bookings.serviceSnapshot,
            createdAt: bookings.createdAt,
          })
          .from(bookings)
          .where(and(...conditions))
          .orderBy(input.upcoming ? bookings.startTime : desc(bookings.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(bookings).where(and(...conditions)),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get booking detail (customer) */
  myBookingDetail: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [booking] = await ctx.db
        .select()
        .from(bookings)
        .where(and(eq(bookings.id, input.id), eq(bookings.userId, userId)))
        .limit(1);

      if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });

      const events = await ctx.db
        .select()
        .from(bookingEvents)
        .where(eq(bookingEvents.bookingId, input.id))
        .orderBy(desc(bookingEvents.createdAt))
        .limit(50);

      return { ...booking, events };
    }),

  /** Cancel own booking */
  cancel: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify ownership
      const [booking] = await ctx.db
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.id, input.id), eq(bookings.userId, userId)))
        .limit(1);

      if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });

      await cancelBooking(input.id, userId, input.reason, false);
      return { success: true };
    }),

  /** Reschedule own booking */
  reschedule: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      newStartTime: z.string().datetime(),
      newEndTime: z.string().datetime(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [booking] = await ctx.db
        .select()
        .from(bookings)
        .where(and(eq(bookings.id, input.id), eq(bookings.userId, userId)))
        .limit(1);

      if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
      if (booking.status !== 'confirmed' && booking.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only reschedule pending or confirmed bookings' });
      }

      // Check new slot availability (exclude current booking)
      const newStart = new Date(input.newStartTime);
      const newEnd = new Date(input.newEndTime);
      const available = await isSlotAvailable(booking.serviceId, newStart, newEnd, booking.attendees, booking.id);
      if (!available) {
        throw new TRPCError({ code: 'CONFLICT', message: 'New time slot is not available' });
      }

      await ctx.db.update(bookings)
        .set({ startTime: newStart, endTime: newEnd, updatedAt: new Date() })
        .where(eq(bookings.id, input.id));

      await ctx.db.insert(bookingEvents).values({
        bookingId: input.id,
        fromStatus: booking.status,
        toStatus: booking.status,
        actor: userId,
        note: `Rescheduled from ${booking.startTime.toISOString()} to ${newStart.toISOString()}`,
      });

      return { success: true };
    }),

  // ─── Admin: Booking management ──────────────────────────────────────────

  /** List all bookings (admin) */
  adminList: bookingAdminProcedure
    .input(z.object({
      serviceId: z.string().uuid().optional(),
      status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      search: z.string().max(200).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [eq(bookings.organizationId, orgId)];

      if (input.serviceId) conditions.push(eq(bookings.serviceId, input.serviceId));
      if (input.status) conditions.push(eq(bookings.status, input.status));
      if (input.from) conditions.push(gte(bookings.startTime, new Date(input.from)));
      if (input.to) conditions.push(lt(bookings.startTime, new Date(input.to)));
      if (input.search) {
        conditions.push(sql`(
          ${bookings.bookingNumber} ILIKE ${'%' + input.search + '%'}
          OR ${bookings.guestName} ILIKE ${'%' + input.search + '%'}
          OR ${bookings.guestEmail} ILIKE ${'%' + input.search + '%'}
        )`);
      }

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: bookings.id,
            bookingNumber: bookings.bookingNumber,
            userId: bookings.userId,
            guestName: bookings.guestName,
            guestEmail: bookings.guestEmail,
            status: bookings.status,
            startTime: bookings.startTime,
            endTime: bookings.endTime,
            attendees: bookings.attendees,
            priceCents: bookings.priceCents,
            currency: bookings.currency,
            serviceSnapshot: bookings.serviceSnapshot,
            createdAt: bookings.createdAt,
          })
          .from(bookings)
          .where(and(...conditions))
          .orderBy(desc(bookings.startTime))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(bookings).where(and(...conditions)),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get booking detail (admin) */
  adminGet: bookingAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      const [booking] = await ctx.db
        .select()
        .from(bookings)
        .where(and(eq(bookings.id, input.id), eq(bookings.organizationId, orgId)))
        .limit(1);

      if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });

      const events = await ctx.db
        .select()
        .from(bookingEvents)
        .where(eq(bookingEvents.bookingId, input.id))
        .orderBy(desc(bookingEvents.createdAt))
        .limit(100);

      return { ...booking, events };
    }),

  /** Update booking status (admin) */
  adminUpdateStatus: bookingAdminProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      const [booking] = await ctx.db
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.id, input.id), eq(bookings.organizationId, orgId)))
        .limit(1);

      if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });

      if (input.status === 'cancelled') {
        await cancelBooking(input.id, ctx.session.user.id, input.note, true);
      } else {
        await updateBookingStatus(input.id, input.status, ctx.session.user.id, input.note);
      }

      return { success: true };
    }),

  /** Add admin note to a booking */
  adminAddNote: bookingAdminProcedure
    .input(z.object({
      id: z.string().uuid(),
      note: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);

      const [booking] = await ctx.db
        .select({ id: bookings.id, adminNote: bookings.adminNote })
        .from(bookings)
        .where(and(eq(bookings.id, input.id), eq(bookings.organizationId, orgId)))
        .limit(1);

      if (!booking) throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });

      const updatedNote = booking.adminNote
        ? `${booking.adminNote}\n\n---\n${new Date().toISOString()} (${ctx.session.user.id}):\n${input.note}`
        : `${new Date().toISOString()} (${ctx.session.user.id}):\n${input.note}`;

      await ctx.db.update(bookings)
        .set({ adminNote: updatedNote, updatedAt: new Date() })
        .where(eq(bookings.id, input.id));

      return { success: true };
    }),

  // ─── Admin: Dashboard stats ─────────────────────────────────────────────

  /** Get booking statistics for dashboard */
  adminStats: bookingAdminProcedure
    .query(async ({ ctx }) => {
      const orgId = await resolveOrgId(ctx.activeOrganizationId, ctx.session.user.id);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      const weekStart = new Date(todayStart.getTime() - todayStart.getDay() * 24 * 60 * 60 * 1000);

      const [
        [totalRow],
        [pendingRow],
        [todayRow],
        [weekRow],
      ] = await Promise.all([
        ctx.db.select({ count: count() }).from(bookings)
          .where(and(eq(bookings.organizationId, orgId), ne(bookings.status, 'cancelled'))),
        ctx.db.select({ count: count() }).from(bookings)
          .where(and(eq(bookings.organizationId, orgId), eq(bookings.status, 'pending'))),
        ctx.db.select({ count: count() }).from(bookings)
          .where(and(
            eq(bookings.organizationId, orgId),
            gte(bookings.startTime, todayStart),
            lt(bookings.startTime, todayEnd),
            ne(bookings.status, 'cancelled'),
          )),
        ctx.db.select({ count: count() }).from(bookings)
          .where(and(
            eq(bookings.organizationId, orgId),
            gte(bookings.startTime, weekStart),
            lt(bookings.startTime, todayEnd),
            ne(bookings.status, 'cancelled'),
          )),
      ]);

      return {
        total: totalRow?.count ?? 0,
        pending: pendingRow?.count ?? 0,
        today: todayRow?.count ?? 0,
        thisWeek: weekRow?.count ?? 0,
      };
    }),
});
