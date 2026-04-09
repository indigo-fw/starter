import { eq, sql, and, ne, gte, lt, count } from 'drizzle-orm';
import { db } from '@/server/db';
import { bookings, bookingEvents, bookingReminders } from '@/core-booking/schema/bookings';
import { bookingServices } from '@/core-booking/schema/services';
import { isSlotAvailable } from './availability-service';
import { getBookingDeps } from '@/core-booking/deps';
import { createLogger } from '@/core/lib/logger';

const logger = createLogger('booking-service');

export interface CreateBookingParams {
  organizationId: string;
  serviceId: string;
  startTime: Date;
  endTime: Date;
  userId?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  attendees?: number;
  customerNote?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Generate sequential booking number: BOOK-YYYYMMDD-XXXX
 */
async function generateBookingNumber(): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `BOOK-${date}-`;

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(sql`${bookings.bookingNumber} LIKE ${prefix + '%'}`);

  const seq = String((result?.count ?? 0) + 1).padStart(4, '0');
  return `${prefix}${seq}`;
}

/**
 * Create a new booking.
 *
 * 1. Validate service exists and is published
 * 2. Check time slot availability
 * 3. Create booking record
 * 4. Log creation event
 * 5. Schedule reminders
 * 6. Send confirmation notification
 */
export async function createBooking(params: CreateBookingParams): Promise<{ bookingId: string; bookingNumber: string }> {
  // Validate service
  const [service] = await db
    .select()
    .from(bookingServices)
    .where(eq(bookingServices.id, params.serviceId))
    .limit(1);

  if (!service || service.status !== 'published' || service.deletedAt) {
    throw new Error('Service not found or not available');
  }

  const attendees = params.attendees ?? 1;

  // Check availability
  const available = await isSlotAvailable(params.serviceId, params.startTime, params.endTime, attendees);
  if (!available) {
    throw new Error('Time slot is no longer available');
  }

  // Create booking
  const bookingNumber = await generateBookingNumber();
  const bookingId = crypto.randomUUID();
  const initialStatus = service.requiresApproval ? 'pending' : (service.priceCents > 0 ? 'pending' : 'confirmed');

  await db.insert(bookings).values({
    id: bookingId,
    organizationId: params.organizationId,
    serviceId: params.serviceId,
    bookingNumber,
    userId: params.userId ?? null,
    guestName: params.guestName ?? null,
    guestEmail: params.guestEmail ?? null,
    guestPhone: params.guestPhone ?? null,
    status: initialStatus,
    startTime: params.startTime,
    endTime: params.endTime,
    attendees,
    priceCents: service.priceCents,
    currency: service.currency,
    serviceSnapshot: {
      name: service.name,
      durationMinutes: service.durationMinutes,
      location: service.location,
      type: service.type,
    },
    customerNote: params.customerNote ?? null,
    metadata: params.metadata ?? null,
  });

  // Log creation event
  await db.insert(bookingEvents).values({
    bookingId,
    fromStatus: null,
    toStatus: initialStatus,
    actor: params.userId ?? 'guest',
    note: 'Booking created',
  });

  // Schedule reminders (24h and 1h before)
  await scheduleReminders(bookingId, params.startTime);

  // Send confirmation notification
  const deps = getBookingDeps();
  const email = params.guestEmail ?? (params.userId ? undefined : undefined);

  if (params.userId) {
    deps.sendNotification({
      userId: params.userId,
      title: initialStatus === 'confirmed' ? 'Booking Confirmed' : 'Booking Pending',
      body: `Your booking for ${service.name} on ${params.startTime.toLocaleDateString()} has been ${initialStatus === 'confirmed' ? 'confirmed' : 'submitted for approval'}.`,
      actionUrl: `/account/bookings/${bookingId}`,
    });
  }

  if (email || params.guestEmail) {
    deps.enqueueTemplateEmail(
      (email || params.guestEmail)!,
      'booking-confirmation',
      {
        bookingNumber,
        serviceName: service.name,
        startTime: params.startTime.toISOString(),
        endTime: params.endTime.toISOString(),
        location: service.location ?? '',
        status: initialStatus,
      },
    ).catch((err) => logger.error('Failed to send booking confirmation email', err));
  }

  logger.info('Booking created', { bookingId, bookingNumber, serviceId: params.serviceId, status: initialStatus });

  return { bookingId, bookingNumber };
}

/**
 * Update booking status with event logging.
 */
export async function updateBookingStatus(
  bookingId: string,
  newStatus: string,
  actor: string,
  note?: string,
): Promise<void> {
  const [existing] = await db
    .select({ status: bookings.status, userId: bookings.userId, guestEmail: bookings.guestEmail })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!existing) throw new Error('Booking not found');

  const updates: Record<string, unknown> = { status: newStatus, updatedAt: new Date() };

  if (newStatus === 'cancelled') {
    updates.cancelledAt = new Date();
    updates.cancelledBy = actor;
    if (note) updates.cancellationReason = note;
  }
  if (newStatus === 'confirmed' && existing.status === 'pending') {
    // Could set paidAt if payment was confirmed
  }

  await db.update(bookings)
    .set(updates)
    .where(eq(bookings.id, bookingId));

  await db.insert(bookingEvents).values({
    bookingId,
    fromStatus: existing.status,
    toStatus: newStatus,
    actor,
    note: note ?? null,
  });

  // Notify customer
  const deps = getBookingDeps();
  if (existing.userId) {
    deps.sendNotification({
      userId: existing.userId,
      title: `Booking ${newStatus}`,
      body: `Your booking has been ${newStatus}.${note ? ` Note: ${note}` : ''}`,
      actionUrl: `/account/bookings/${bookingId}`,
    });
  }

  logger.info('Booking status updated', { bookingId, from: existing.status, to: newStatus, actor });
}

/**
 * Cancel a booking with optional reason.
 * Checks cancellation deadline if set on the service.
 */
export async function cancelBooking(
  bookingId: string,
  actor: string,
  reason?: string,
  isAdmin: boolean = false,
): Promise<void> {
  const [booking] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      startTime: bookings.startTime,
      serviceId: bookings.serviceId,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking) throw new Error('Booking not found');
  if (booking.status === 'cancelled' || booking.status === 'completed') {
    throw new Error(`Cannot cancel a ${booking.status} booking`);
  }

  // Check cancellation deadline (skip for admins)
  if (!isAdmin) {
    const [service] = await db
      .select({ cancellationDeadlineHours: bookingServices.cancellationDeadlineHours })
      .from(bookingServices)
      .where(eq(bookingServices.id, booking.serviceId))
      .limit(1);

    if (service?.cancellationDeadlineHours) {
      const deadline = new Date(booking.startTime.getTime() - service.cancellationDeadlineHours * 60 * 60 * 1000);
      if (new Date() > deadline) {
        throw new Error(`Cancellation deadline has passed (${service.cancellationDeadlineHours}h before start)`);
      }
    }
  }

  await updateBookingStatus(bookingId, 'cancelled', actor, reason);

  // Cancel pending reminders
  await db.update(bookingReminders)
    .set({ status: 'failed' })
    .where(and(
      eq(bookingReminders.bookingId, bookingId),
      eq(bookingReminders.status, 'scheduled'),
    ));
}

/**
 * Schedule reminders for a booking (24h and 1h before start).
 */
async function scheduleReminders(bookingId: string, startTime: Date): Promise<void> {
  const reminders = [
    { type: '24h', offsetMs: 24 * 60 * 60 * 1000 },
    { type: '1h', offsetMs: 1 * 60 * 60 * 1000 },
  ];

  const now = new Date();
  const values = reminders
    .map((r) => ({
      bookingId,
      type: r.type,
      scheduledAt: new Date(startTime.getTime() - r.offsetMs),
      status: 'scheduled' as const,
    }))
    .filter((r) => r.scheduledAt > now);

  if (values.length > 0) {
    await db.insert(bookingReminders).values(values);
  }
}

/**
 * Get booking count for an org in the current month (for feature gating).
 */
export async function getBookingCountThisMonth(organizationId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [result] = await db
    .select({ count: count() })
    .from(bookings)
    .where(and(
      eq(bookings.organizationId, organizationId),
      gte(bookings.createdAt, monthStart),
      lt(bookings.createdAt, monthEnd),
      ne(bookings.status, 'cancelled'),
    ));

  return result?.count ?? 0;
}
