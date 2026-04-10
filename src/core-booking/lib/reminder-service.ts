import { and, eq, lt, lte, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { bookingReminders, bookings, bookingEvents } from '@/core-booking/schema/bookings';
import { bookingServices } from '@/core-booking/schema/services';
import { getBookingDeps } from '@/core-booking/deps';
import { createLogger } from '@/core/lib/logger';

const logger = createLogger('booking-reminders');

/**
 * Process due reminders — called by the background worker.
 *
 * Uses a single JOIN query to fetch reminders with booking + service data,
 * avoiding N+1 queries per reminder.
 */
export async function processDueReminders(): Promise<number> {
  const now = new Date();

  // Single query: reminders JOIN bookings JOIN services
  const dueReminders = await db
    .select({
      reminderId: bookingReminders.id,
      reminderType: bookingReminders.type,
      bookingId: bookings.id,
      bookingNumber: bookings.bookingNumber,
      bookingStatus: bookings.status,
      userId: bookings.userId,
      guestEmail: bookings.guestEmail,
      startTime: bookings.startTime,
      serviceName: bookingServices.name,
    })
    .from(bookingReminders)
    .innerJoin(bookings, eq(bookingReminders.bookingId, bookings.id))
    .innerJoin(bookingServices, eq(bookings.serviceId, bookingServices.id))
    .where(and(
      eq(bookingReminders.status, 'scheduled'),
      lte(bookingReminders.scheduledAt, now),
    ))
    .limit(100);

  if (dueReminders.length === 0) return 0;

  const deps = getBookingDeps();
  let sentCount = 0;

  for (const reminder of dueReminders) {
    try {
      // Skip if booking is in a terminal state
      if (reminder.bookingStatus === 'cancelled' || reminder.bookingStatus === 'completed' || reminder.bookingStatus === 'no_show') {
        await db.update(bookingReminders)
          .set({ status: 'failed' })
          .where(eq(bookingReminders.id, reminder.reminderId));
        continue;
      }

      const serviceName = reminder.serviceName ?? 'your appointment';
      const timeLabel = reminder.reminderType === '24h' ? 'tomorrow' : 'in 1 hour';

      // Send in-app notification
      if (reminder.userId) {
        deps.sendNotification({
          userId: reminder.userId,
          title: 'Booking Reminder',
          body: `Your booking for ${serviceName} starts ${timeLabel}.`,
          actionUrl: `/account/bookings/${reminder.bookingId}`,
        });
      }

      // Send email reminder
      if (reminder.guestEmail) {
        await deps.enqueueTemplateEmail(reminder.guestEmail, 'booking-reminder', {
          bookingNumber: reminder.bookingNumber,
          serviceName,
          startTime: reminder.startTime.toISOString(),
          reminderType: reminder.reminderType,
        });
      }

      // Mark as sent
      await db.update(bookingReminders)
        .set({ status: 'sent', sentAt: now })
        .where(eq(bookingReminders.id, reminder.reminderId));

      sentCount++;
    } catch (err) {
      logger.error(`Failed to process reminder ${reminder.reminderId}`, err instanceof Error ? { error: err.message } : undefined);
      await db.update(bookingReminders)
        .set({ status: 'failed' })
        .where(eq(bookingReminders.id, reminder.reminderId));
    }
  }

  if (sentCount > 0) {
    logger.info(`Processed ${sentCount} booking reminders`);
  }

  return sentCount;
}

/**
 * Auto-cancel expired pending bookings.
 *
 * Bookings in 'pending' status that have passed their start time
 * are automatically cancelled. Uses batch updates to minimize queries.
 */
export async function cancelExpiredBookings(): Promise<number> {
  const now = new Date();

  // Find expired booking IDs
  const expired = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(
      eq(bookings.status, 'pending'),
      lt(bookings.startTime, now),
    ))
    .limit(100);

  if (expired.length === 0) return 0;

  const expiredIds = expired.map((b) => b.id);

  // Batch update: cancel all expired bookings in one query
  await db.update(bookings)
    .set({
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: 'system',
      cancellationReason: 'Expired — not confirmed before start time',
      updatedAt: now,
    })
    .where(and(
      eq(bookings.status, 'pending'),
      lt(bookings.startTime, now),
    ));

  // Batch cancel all pending reminders for these bookings
  await db.update(bookingReminders)
    .set({ status: 'failed' })
    .where(and(
      sql`${bookingReminders.bookingId} IN (${sql.join(expiredIds.map((id) => sql`${id}`), sql`, `)})`,
      eq(bookingReminders.status, 'scheduled'),
    ));

  // Log audit events (these are cheap inserts, batch them)
  const eventValues = expiredIds.map((id) => ({
    bookingId: id,
    fromStatus: 'pending',
    toStatus: 'cancelled',
    actor: 'system',
    note: 'Auto-cancelled: not confirmed before start time',
  }));

  if (eventValues.length > 0) {
    await db.insert(bookingEvents).values(eventValues);
  }

  logger.info(`Auto-cancelled ${expiredIds.length} expired pending bookings`);
  return expiredIds.length;
}
