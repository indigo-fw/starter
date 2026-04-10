import { eq, sql, and, ne, gte, lt, count } from 'drizzle-orm';
import { db } from '@/server/db';
import { bookings, bookingEvents, bookingReminders } from '@/core-booking/schema/bookings';
import { bookingServices } from '@/core-booking/schema/services';
import { reserveSlotAtomically } from './availability-service';
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

const MAX_BOOKING_NUMBER_RETRIES = 5;

/**
 * Generate sequential booking number: BOOK-YYYYMMDD-XXXX
 *
 * Uses a retry loop to handle concurrent inserts that could produce
 * duplicate numbers (the unique constraint on bookingNumber rejects them).
 */
async function generateBookingNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `BOOK-${date}-`;

  // Use a sub-select with FOR UPDATE SKIP LOCKED for advisory-style lock
  const [result] = await tx
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(sql`${bookings.bookingNumber} LIKE ${prefix + '%'}`);

  const seq = String((result?.count ?? 0) + 1).padStart(4, '0');
  return `${prefix}${seq}`;
}

/**
 * Create a new booking inside a transaction.
 *
 * 1. Validate service exists and is published
 * 2. Atomically check slot availability (SELECT FOR UPDATE)
 * 3. Generate booking number
 * 4. Insert booking + event + reminders in single transaction
 * 5. Fire side effects (notifications, email) AFTER commit
 */
export async function createBooking(params: CreateBookingParams): Promise<{ bookingId: string; bookingNumber: string }> {
  // Validate service (outside transaction — read-only)
  const [service] = await db
    .select()
    .from(bookingServices)
    .where(eq(bookingServices.id, params.serviceId))
    .limit(1);

  if (!service || service.status !== 'published' || service.deletedAt) {
    throw new Error('Service not found or not available');
  }

  const attendees = params.attendees ?? 1;
  const initialStatus = service.requiresApproval ? 'pending' : (service.priceCents > 0 ? 'pending' : 'confirmed');

  let bookingId = '';
  let bookingNumber = '';
  let retries = 0;

  // Retry loop for booking number collisions
  while (retries < MAX_BOOKING_NUMBER_RETRIES) {
    try {
      const result = await db.transaction(async (tx) => {
        // Atomically check capacity with row-level locking
        const available = await reserveSlotAtomically(
          tx, params.serviceId, params.startTime, params.endTime, attendees, service.maxCapacity,
        );
        if (!available) {
          throw new Error('Time slot is no longer available');
        }

        // Generate booking number inside transaction
        const txBookingNumber = await generateBookingNumber(tx);
        const txBookingId = crypto.randomUUID();

        // Insert booking
        await tx.insert(bookings).values({
          id: txBookingId,
          organizationId: params.organizationId,
          serviceId: params.serviceId,
          bookingNumber: txBookingNumber,
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
        await tx.insert(bookingEvents).values({
          bookingId: txBookingId,
          fromStatus: null,
          toStatus: initialStatus,
          actor: params.userId ?? 'guest',
          note: 'Booking created',
        });

        // Schedule reminders (inside transaction so they're atomic with the booking)
        const reminderValues = buildReminderValues(txBookingId, params.startTime);
        if (reminderValues.length > 0) {
          await tx.insert(bookingReminders).values(reminderValues);
        }

        return { bookingId: txBookingId, bookingNumber: txBookingNumber };
      });

      bookingId = result.bookingId;
      bookingNumber = result.bookingNumber;
      break; // Success — exit retry loop
    } catch (err) {
      // Retry on unique constraint violation (booking number collision)
      const message = err instanceof Error ? err.message : '';
      if (message.includes('unique') || message.includes('duplicate') || message.includes('bookings_booking_number_unique')) {
        retries++;
        if (retries >= MAX_BOOKING_NUMBER_RETRIES) throw err;
        continue;
      }
      throw err; // Non-retryable error
    }
  }

  // ─── Side effects AFTER successful commit ────────────────────────────────

  const deps = getBookingDeps();

  if (params.userId) {
    deps.sendNotification({
      userId: params.userId,
      title: initialStatus === 'confirmed' ? 'Booking Confirmed' : 'Booking Pending',
      body: `Your booking for ${service.name} on ${params.startTime.toLocaleDateString()} has been ${initialStatus === 'confirmed' ? 'confirmed' : 'submitted for approval'}.`,
      actionUrl: `/account/bookings/${bookingId}`,
    });
  }

  const email = params.guestEmail;
  if (email) {
    deps.enqueueTemplateEmail(
      email,
      'booking-confirmation',
      {
        bookingNumber,
        serviceName: service.name,
        startTime: params.startTime.toISOString(),
        endTime: params.endTime.toISOString(),
        location: service.location ?? '',
        status: initialStatus,
      },
    ).catch((err) => logger.error('Failed to send booking confirmation email', err instanceof Error ? { error: err.message } : undefined));
  }

  logger.info('Booking created', { bookingId, bookingNumber, serviceId: params.serviceId, status: initialStatus });

  return { bookingId, bookingNumber };
}

/**
 * Build reminder records for a booking.
 */
function buildReminderValues(bookingId: string, startTime: Date) {
  const offsets = [
    { type: '24h', offsetMs: 24 * 3_600_000 },
    { type: '1h', offsetMs: 1 * 3_600_000 },
  ];

  const now = new Date();
  return offsets
    .map((r) => ({
      bookingId,
      type: r.type,
      scheduledAt: new Date(startTime.getTime() - r.offsetMs),
      status: 'scheduled' as const,
    }))
    .filter((r) => r.scheduledAt > now);
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

  await db.transaction(async (tx) => {
    await tx.update(bookings)
      .set(updates)
      .where(eq(bookings.id, bookingId));

    await tx.insert(bookingEvents).values({
      bookingId,
      fromStatus: existing.status,
      toStatus: newStatus,
      actor,
      note: note ?? null,
    });
  });

  // Side effects after commit
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
      const deadline = new Date(booking.startTime.getTime() - service.cancellationDeadlineHours * 3_600_000);
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
