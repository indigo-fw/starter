import { and, eq, gte, lt, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { bookingServices } from '@/core-booking/schema/services';
import { bookingSchedules, bookingOverrides } from '@/core-booking/schema/availability';
import { bookings } from '@/core-booking/schema/bookings';
import type { BookingService } from '@/core-booking/schema/services';

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  availableCapacity: number;
}

/**
 * Get available time slots for a service on a specific date.
 *
 * Flow:
 * 1. Check date overrides (unavailable? custom hours?)
 * 2. Get recurring schedule for the day of week
 * 3. Generate slots based on duration + buffer
 * 4. Subtract existing bookings (capacity check)
 * 5. Filter out past slots and slots outside advance booking window
 */
export async function getAvailableSlots(
  serviceId: string,
  date: string, // YYYY-MM-DD
): Promise<TimeSlot[]> {
  // Fetch service details
  const [service] = await db
    .select()
    .from(bookingServices)
    .where(eq(bookingServices.id, serviceId))
    .limit(1);

  if (!service || service.status !== 'published' || service.deletedAt) return [];

  // Check date override
  const [override] = await db
    .select()
    .from(bookingOverrides)
    .where(and(
      eq(bookingOverrides.serviceId, serviceId),
      eq(bookingOverrides.date, date),
    ))
    .limit(1);

  if (override?.isUnavailable) return [];

  // Determine working hours for this date
  let startTime: string | null = null;
  let endTime: string | null = null;

  if (override?.startTime && override?.endTime) {
    // Use override hours
    startTime = override.startTime;
    endTime = override.endTime;
  } else {
    // Use recurring schedule
    const dateObj = new Date(date + 'T00:00:00');
    const dayOfWeek = dateObj.getUTCDay();

    const schedules = await db
      .select()
      .from(bookingSchedules)
      .where(and(
        eq(bookingSchedules.serviceId, serviceId),
        eq(bookingSchedules.dayOfWeek, dayOfWeek),
        eq(bookingSchedules.isActive, true),
      ))
      .limit(10);

    if (schedules.length === 0) return [];

    // Use earliest start and latest end across all schedules for the day
    startTime = schedules.reduce((min, s) => s.startTime < min ? s.startTime : min, schedules[0]!.startTime);
    endTime = schedules.reduce((max, s) => s.endTime > max ? s.endTime : max, schedules[0]!.endTime);
  }

  if (!startTime || !endTime) return [];

  // Generate time slots
  const slots = generateSlots(date, startTime, endTime, service);

  if (slots.length === 0) return [];

  // Get existing bookings for this date range
  const dayStart = slots[0]!.startTime;
  const dayEnd = slots[slots.length - 1]!.endTime;

  const existingBookings = await db
    .select({
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      attendees: bookings.attendees,
    })
    .from(bookings)
    .where(and(
      eq(bookings.serviceId, serviceId),
      ne(bookings.status, 'cancelled'),
      ne(bookings.status, 'no_show'),
      lt(bookings.startTime, dayEnd),
      gte(bookings.endTime, dayStart),
    ))
    .limit(500);

  // Calculate available capacity per slot
  const now = new Date();
  const availableSlots: TimeSlot[] = [];

  for (const slot of slots) {
    // Skip past slots
    if (slot.startTime <= now) continue;

    // Check advance booking window
    if (service.minAdvanceHours) {
      const minAdvance = new Date(slot.startTime.getTime() - service.minAdvanceHours * 60 * 60 * 1000);
      if (now > minAdvance) continue;
    }
    if (service.maxAdvanceHours) {
      const maxAdvance = new Date(slot.startTime.getTime() - service.maxAdvanceHours * 60 * 60 * 1000);
      if (now < maxAdvance) continue;
    }

    // Count booked capacity for this slot
    const bookedCapacity = existingBookings
      .filter((b) => b.startTime < slot.endTime && b.endTime > slot.startTime)
      .reduce((sum, b) => sum + b.attendees, 0);

    const availableCapacity = service.maxCapacity - bookedCapacity;
    if (availableCapacity > 0) {
      availableSlots.push({ ...slot, availableCapacity });
    }
  }

  return availableSlots;
}

/**
 * Generate time slots from start to end based on duration + buffer.
 */
function generateSlots(
  date: string,
  startTime: string,
  endTime: string,
  service: BookingService,
): { startTime: Date; endTime: Date }[] {
  const [startH, startM] = startTime.split(':').map(Number) as [number, number];
  const [endH, endM] = endTime.split(':').map(Number) as [number, number];

  const dayStart = new Date(date + 'T00:00:00Z');
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const slotDuration = service.durationMinutes;
  const step = slotDuration + service.bufferMinutes;

  const slots: { startTime: Date; endTime: Date }[] = [];
  let current = startMinutes;

  while (current + slotDuration <= endMinutes) {
    const slotStart = new Date(dayStart.getTime() + current * 60 * 1000);
    const slotEnd = new Date(dayStart.getTime() + (current + slotDuration) * 60 * 1000);
    slots.push({ startTime: slotStart, endTime: slotEnd });
    current += step;
  }

  return slots;
}

/**
 * Check if a specific time slot is available for a service.
 */
export async function isSlotAvailable(
  serviceId: string,
  startTime: Date,
  endTime: Date,
  attendees: number = 1,
  excludeBookingId?: string,
): Promise<boolean> {
  const [service] = await db
    .select({ maxCapacity: bookingServices.maxCapacity })
    .from(bookingServices)
    .where(eq(bookingServices.id, serviceId))
    .limit(1);

  if (!service) return false;

  const conditions = [
    eq(bookings.serviceId, serviceId),
    ne(bookings.status, 'cancelled'),
    ne(bookings.status, 'no_show'),
    lt(bookings.startTime, endTime),
    gte(bookings.endTime, startTime),
  ];

  if (excludeBookingId) {
    conditions.push(ne(bookings.id, excludeBookingId));
  }

  const [result] = await db
    .select({ total: sql<number>`COALESCE(SUM(${bookings.attendees}), 0)` })
    .from(bookings)
    .where(and(...conditions));

  const bookedCapacity = Number(result?.total ?? 0);
  return (bookedCapacity + attendees) <= service.maxCapacity;
}
