import { createQueue, createWorker } from '@/core/lib/infra/queue';
import { createLogger } from '@/core/lib/infra/logger';
import { processDueReminders, cancelExpiredBookings } from '@/core-booking/lib/reminder-service';

const logger = createLogger('booking-worker');
const _bookingQueue = createQueue('booking');

/**
 * Start the booking background worker.
 *
 * Runs every 60 seconds and handles:
 * 1. Processing due reminders (24h/1h before booking)
 * 2. Auto-cancelling expired pending bookings
 */
export function startBookingWorker(): void {
  if (!_bookingQueue) {
    logger.warn('Queue not available — skipping booking worker');
    return;
  }

  // Schedule recurring job
  _bookingQueue.upsertJobScheduler('booking-maintenance', {
    every: 60_000, // every 60 seconds
  }, {
    name: 'booking-maintenance',
  }).catch((err) => logger.error('Failed to schedule booking maintenance', err));

  createWorker('booking', async (job) => {
    if (job.name === 'booking-maintenance') {
      const [reminders, cancelled] = await Promise.all([
        processDueReminders(),
        cancelExpiredBookings(),
      ]);

      return { reminders, cancelled };
    }
  });

  logger.info('Booking worker started');
}
