import { and, eq, lt, lte } from 'drizzle-orm';
import { db } from '@/server/db';
import { bookingReminders, bookings } from '@/core-booking/schema/bookings';
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
 * are automatically cancelled.
 */
export async function cancelExpiredBookings(): Promise<number> {
  const now = new Date();

  const expired = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(
      eq(bookings.status, 'pending'),
      lt(bookings.startTime, now),
    ))
    .limit(100);

  if (expired.length === 0) return 0;

  for (const booking of expired) {
    await db.update(bookings)
      .set({ status: 'cancelled', cancelledAt: now, cancelledBy: 'system', cancellationReason: 'Expired — not confirmed before start time', updatedAt: now })
      .where(eq(bookings.id, booking.id));

    // Cancel pending reminders
    await db.update(bookingReminders)
      .set({ status: 'failed' })
      .where(and(
        eq(bookingReminders.bookingId, booking.id),
        eq(bookingReminders.status, 'scheduled'),
      ));
  }

  logger.info(`Auto-cancelled ${expired.length} expired pending bookings`);
  return expired.length;
}
