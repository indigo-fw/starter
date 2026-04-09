import { and, eq, lt, lte } from 'drizzle-orm';
import { db } from '@/server/db';
import { bookingReminders } from '@/core-booking/schema/bookings';
import { bookings } from '@/core-booking/schema/bookings';
import { bookingServices } from '@/core-booking/schema/services';
import { getBookingDeps } from '@/core-booking/deps';
import { createLogger } from '@/core/lib/logger';

const logger = createLogger('booking-reminders');

/**
 * Process due reminders — called by the background worker.
 *
 * Finds all scheduled reminders where scheduledAt <= now,
 * sends notification/email, marks as sent.
 */
export async function processDueReminders(): Promise<number> {
  const now = new Date();

  const dueReminders = await db
    .select({
      id: bookingReminders.id,
      bookingId: bookingReminders.bookingId,
      type: bookingReminders.type,
    })
    .from(bookingReminders)
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
      // Fetch booking details
      const [booking] = await db
        .select({
          id: bookings.id,
          status: bookings.status,
          userId: bookings.userId,
          guestEmail: bookings.guestEmail,
          guestName: bookings.guestName,
          startTime: bookings.startTime,
          serviceId: bookings.serviceId,
          bookingNumber: bookings.bookingNumber,
        })
        .from(bookings)
        .where(eq(bookings.id, reminder.bookingId))
        .limit(1);

      // Skip if booking is cancelled/completed/no-show
      if (!booking || booking.status === 'cancelled' || booking.status === 'completed' || booking.status === 'no_show') {
        await db.update(bookingReminders)
          .set({ status: 'failed' })
          .where(eq(bookingReminders.id, reminder.id));
        continue;
      }

      // Get service name
      const [service] = await db
        .select({ name: bookingServices.name })
        .from(bookingServices)
        .where(eq(bookingServices.id, booking.serviceId))
        .limit(1);

      const serviceName = service?.name ?? 'your appointment';
      const timeLabel = reminder.type === '24h' ? 'tomorrow' : 'in 1 hour';

      // Send in-app notification
      if (booking.userId) {
        deps.sendNotification({
          userId: booking.userId,
          title: 'Booking Reminder',
          body: `Your booking for ${serviceName} starts ${timeLabel}.`,
          actionUrl: `/account/bookings/${booking.id}`,
        });
      }

      // Send email reminder
      const email = booking.guestEmail;
      if (email) {
        await deps.enqueueTemplateEmail(email, 'booking-reminder', {
          bookingNumber: booking.bookingNumber,
          serviceName,
          startTime: booking.startTime.toISOString(),
          reminderType: reminder.type,
        });
      }

      // Mark as sent
      await db.update(bookingReminders)
        .set({ status: 'sent', sentAt: now })
        .where(eq(bookingReminders.id, reminder.id));

      sentCount++;
    } catch (err) {
      logger.error(`Failed to process reminder ${reminder.id}`, err instanceof Error ? { error: err.message } : undefined);
      await db.update(bookingReminders)
        .set({ status: 'failed' })
        .where(eq(bookingReminders.id, reminder.id));
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
