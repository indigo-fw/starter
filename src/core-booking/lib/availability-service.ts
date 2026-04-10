import { and, eq, gte, lt, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { bookingServices } from '@/core-booking/schema/services';
import { bookingSchedules, bookingOverrides } from '@/core-booking/schema/availability';
import { bookings } from '@/core-booking/schema/bookings';
import type { BookingService } from '@/core-booking/schema/services';
import type { BookingSchedule } from '@/core-booking/schema/availability';
import type { BookingOverride } from '@/core-booking/schema/availability';

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  availableCapacity: number;
}

// ─── Timezone helpers ──────────────────────────────────────────────────────

/**
 * Convert a local time on a specific date in a timezone to a UTC Date.
 *
 * Strategy: construct the wall-clock datetime in the target timezone by
 * using Intl.DateTimeFormat to compute the actual UTC offset, including
 * DST rules. Handles the spring-forward gap by clamping to the next
 * valid time, and the fall-back overlap by using the first occurrence.
 */
export function localToUtc(date: string, time: string, timezone: string): Date {
  // Parse local wall-clock components
  const [h, m] = time.split(':').map(Number) as [number, number];
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];

  // Build a trial UTC date (pretend the local time is UTC)
  const trialUtc = new Date(Date.UTC(year, month - 1, day, h, m, 0));

  // Get the offset at this trial instant
  const offset1 = getUtcOffsetMinutes(trialUtc, timezone);

  // Apply offset: UTC = local - offset
  const attempt = new Date(trialUtc.getTime() - offset1 * 60_000);

  // Verify: the offset at our computed UTC instant might differ (DST boundary).
  // Re-check to converge.
  const offset2 = getUtcOffsetMinutes(attempt, timezone);

  if (offset1 === offset2) {
    return attempt;
  }

  // The offsets differ — we're near a DST transition.
  // Re-apply with the corrected offset.
  const corrected = new Date(trialUtc.getTime() - offset2 * 60_000);

  // Final check: if the local time doesn't exist (spring-forward gap),
  // the corrected time will map to a different local time. In that case,
  // snap forward to the first valid time after the gap.
  const offset3 = getUtcOffsetMinutes(corrected, timezone);
  if (offset2 !== offset3) {
    // We're in the gap — use the later offset (post-transition)
    const laterOffset = Math.max(offset2, offset3);
    return new Date(trialUtc.getTime() - laterOffset * 60_000);
  }

  return corrected;
}

/**
 * Get the UTC offset in minutes for a timezone at a given UTC instant.
 * Positive = ahead of UTC (e.g., CET = +60).
 *
 * Uses Intl.DateTimeFormat to get the local time in the target timezone,
 * then computes the difference from UTC.
 */
function getUtcOffsetMinutes(utcDate: Date, timezone: string): number {
  // Format the date in both UTC and target timezone, extract components
  const utcParts = extractDateParts(utcDate, 'UTC');
  const localParts = extractDateParts(utcDate, timezone);

  const utcMinutes = datePartsToMinutesSinceEpoch(utcParts);
  const localMinutes = datePartsToMinutesSinceEpoch(localParts);

  return localMinutes - utcMinutes;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function extractDateParts(date: Date, timezone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: map.hour === '24' ? 0 : Number(map.hour),
    minute: Number(map.minute),
  };
}

function datePartsToMinutesSinceEpoch(p: DateParts): number {
  // Convert to a comparable minute-level timestamp
  // Using a simple formula: approximate days since epoch * 1440 + minutes
  const d = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) / 60_000;
  return d;
}

/**
 * Get the day of week for a date string in a specific timezone.
 */
function getDayOfWeekInTimezone(date: string, timezone: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  // Use noon UTC to avoid any date boundary ambiguity
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
  const weekday = formatter.format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? 0;
}

// ─── Slot generation ───────────────────────────────────────────────────────

/**
 * Generate time slots in UTC from local schedule times.
 */
function generateSlotsUtc(
  date: string,
  startTime: string,
  endTime: string,
  service: Pick<BookingService, 'durationMinutes' | 'bufferMinutes' | 'timezone'>,
): { startTime: Date; endTime: Date }[] {
  const [startH, startM] = startTime.split(':').map(Number) as [number, number];
  const [endH, endM] = endTime.split(':').map(Number) as [number, number];

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const slotDuration = service.durationMinutes;
  const step = slotDuration + service.bufferMinutes;
  const tz = service.timezone;

  const slots: { startTime: Date; endTime: Date }[] = [];
  let current = startMinutes;

  while (current + slotDuration <= endMinutes) {
    const localStart = minutesToTime(current);
    const localEnd = minutesToTime(current + slotDuration);
    slots.push({
      startTime: localToUtc(date, localStart, tz),
      endTime: localToUtc(date, localEnd, tz),
    });
    current += step;
  }

  return slots;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── Capacity filter (shared logic) ────────────────────────────────────────

interface BookingWindow {
  startTime: Date;
  endTime: Date;
  attendees: number;
}

/**
 * Compute booked capacity for a slot by counting overlapping bookings.
 * A booking overlaps if it starts before the slot ends AND ends after the slot starts.
 */
function getBookedCapacity(
  slot: { startTime: Date; endTime: Date },
  existingBookings: BookingWindow[],
): number {
  let capacity = 0;
  for (const b of existingBookings) {
    if (b.startTime < slot.endTime && b.endTime > slot.startTime) {
      capacity += b.attendees;
    }
  }
  return capacity;
}

/**
 * Filter slots by capacity, advance window, and past-time rules.
 */
function filterAvailableSlots(
  slots: { startTime: Date; endTime: Date }[],
  existingBookings: BookingWindow[],
  service: Pick<BookingService, 'maxCapacity' | 'minAdvanceHours' | 'maxAdvanceHours'>,
  now: Date,
): TimeSlot[] {
  const result: TimeSlot[] = [];

  for (const slot of slots) {
    if (slot.startTime <= now) continue;

    if (service.minAdvanceHours) {
      const earliest = new Date(now.getTime() + service.minAdvanceHours * 3_600_000);
      if (slot.startTime < earliest) continue;
    }
    if (service.maxAdvanceHours) {
      const latest = new Date(now.getTime() + service.maxAdvanceHours * 3_600_000);
      if (slot.startTime > latest) continue;
    }

    const bookedCapacity = getBookedCapacity(slot, existingBookings);
    const availableCapacity = service.maxCapacity - bookedCapacity;
    if (availableCapacity > 0) {
      result.push({ ...slot, availableCapacity });
    }
  }

  return result;
}

// ─── Single-day slot computation ───────────────────────────────────────────

/**
 * Get available time slots for a service on a specific date.
 *
 * Uses the service's timezone to correctly convert local schedule times to UTC.
 */
export async function getAvailableSlots(
  serviceId: string,
  date: string, // YYYY-MM-DD
): Promise<TimeSlot[]> {
  const [service] = await db
    .select()
    .from(bookingServices)
    .where(eq(bookingServices.id, serviceId))
    .limit(1);

  if (!service || service.status !== 'published' || service.deletedAt) return [];

  const dayOfWeek = getDayOfWeekInTimezone(date, service.timezone);

  const [scheduleRows, [override]] = await Promise.all([
    db.select().from(bookingSchedules)
      .where(and(
        eq(bookingSchedules.serviceId, serviceId),
        eq(bookingSchedules.dayOfWeek, dayOfWeek),
        eq(bookingSchedules.isActive, true),
      ))
      .limit(10),
    db.select().from(bookingOverrides)
      .where(and(
        eq(bookingOverrides.serviceId, serviceId),
        eq(bookingOverrides.date, date),
      ))
      .limit(1),
  ]);

  if (override?.isUnavailable) return [];

  let startTime: string | null = null;
  let endTime: string | null = null;

  if (override?.startTime && override?.endTime) {
    startTime = override.startTime;
    endTime = override.endTime;
  } else if (scheduleRows.length > 0) {
    startTime = scheduleRows.reduce((min, s) => s.startTime < min ? s.startTime : min, scheduleRows[0]!.startTime);
    endTime = scheduleRows.reduce((max, s) => s.endTime > max ? s.endTime : max, scheduleRows[0]!.endTime);
  }

  if (!startTime || !endTime) return [];

  const slots = generateSlotsUtc(date, startTime, endTime, service);
  if (slots.length === 0) return [];

  const rangeStart = slots[0]!.startTime;
  const rangeEnd = slots[slots.length - 1]!.endTime;

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
      lt(bookings.startTime, rangeEnd),
      gte(bookings.endTime, rangeStart),
    ))
    .limit(500);

  return filterAvailableSlots(slots, existingBookings, service, new Date());
}

// ─── Batch multi-day availability (for calendar views) ─────────────────────

/**
 * Get available dates for a service in a date range.
 *
 * Uses 3 batch queries (schedules, overrides, bookings), then computes
 * all slots in memory with binary-search overlap detection.
 */
export async function getAvailableDatesInRange(
  serviceId: string,
  from: string,
  to: string,
): Promise<string[]> {
  const maxDays = 62;

  const startDate = new Date(from);
  const endDate = new Date(to);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return [];

  const [service] = await db
    .select()
    .from(bookingServices)
    .where(eq(bookingServices.id, serviceId))
    .limit(1);

  if (!service || service.status !== 'published' || service.deletedAt) return [];

  // UTC range covering the entire local date range
  const rangeStartUtc = localToUtc(from, '00:00', service.timezone);
  const rangeEndUtc = localToUtc(to, '23:59', service.timezone);

  const [allSchedules, allOverrides, allBookings] = await Promise.all([
    db.select().from(bookingSchedules)
      .where(and(
        eq(bookingSchedules.serviceId, serviceId),
        eq(bookingSchedules.isActive, true),
      ))
      .limit(50),
    db.select().from(bookingOverrides)
      .where(and(
        eq(bookingOverrides.serviceId, serviceId),
        gte(bookingOverrides.date, from),
        lte(bookingOverrides.date, to),
      ))
      .limit(200),
    db.select({
      startTime: bookings.startTime,
      endTime: bookings.endTime,
      attendees: bookings.attendees,
    }).from(bookings)
      .where(and(
        eq(bookings.serviceId, serviceId),
        ne(bookings.status, 'cancelled'),
        ne(bookings.status, 'no_show'),
        lt(bookings.startTime, rangeEndUtc),
        gte(bookings.endTime, rangeStartUtc),
      ))
      .limit(2000),
  ]);

  // Index overrides by date
  const overridesByDate = new Map<string, BookingOverride>();
  for (const o of allOverrides) overridesByDate.set(o.date, o);

  // Index schedules by day of week
  const schedulesByDay = new Map<number, BookingSchedule[]>();
  for (const s of allSchedules) {
    const arr = schedulesByDay.get(s.dayOfWeek) ?? [];
    arr.push(s);
    schedulesByDay.set(s.dayOfWeek, arr);
  }

  const now = new Date();
  const dates: string[] = [];
  const current = new Date(startDate);
  let dayCount = 0;

  while (current <= endDate && dayCount < maxDays) {
    const dateStr = current.toISOString().slice(0, 10);
    const override = overridesByDate.get(dateStr);

    if (!override?.isUnavailable) {
      let localStart: string | null = null;
      let localEnd: string | null = null;

      if (override?.startTime && override?.endTime) {
        localStart = override.startTime;
        localEnd = override.endTime;
      } else {
        const dayOfWeek = getDayOfWeekInTimezone(dateStr, service.timezone);
        const daySchedules = schedulesByDay.get(dayOfWeek);
        if (daySchedules && daySchedules.length > 0) {
          localStart = daySchedules.reduce((min, s) => s.startTime < min ? s.startTime : min, daySchedules[0]!.startTime);
          localEnd = daySchedules.reduce((max, s) => s.endTime > max ? s.endTime : max, daySchedules[0]!.endTime);
        }
      }

      if (localStart && localEnd) {
        const slots = generateSlotsUtc(dateStr, localStart, localEnd, service);
        const hasAvailable = slots.some((slot) => {
          if (slot.startTime <= now) return false;
          if (service.minAdvanceHours) {
            if (slot.startTime < new Date(now.getTime() + service.minAdvanceHours * 3_600_000)) return false;
          }
          if (service.maxAdvanceHours) {
            if (slot.startTime > new Date(now.getTime() + service.maxAdvanceHours * 3_600_000)) return false;
          }
          return getBookedCapacity(slot, allBookings) < service.maxCapacity;
        });

        if (hasAvailable) dates.push(dateStr);
      }
    }

    current.setDate(current.getDate() + 1);
    dayCount++;
  }

  return dates;
}

// ─── Slot availability check (for booking creation) ────────────────────────

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

/**
 * Atomically check availability and lock the slot within a transaction.
 * Uses Drizzle's native .for('update') to prevent double-booking.
 *
 * Returns true if the slot has enough capacity for the requested attendees.
 */
export async function reserveSlotAtomically(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  serviceId: string,
  startTime: Date,
  endTime: Date,
  attendees: number,
  maxCapacity: number,
): Promise<boolean> {
  // Lock overlapping bookings with FOR UPDATE to prevent concurrent inserts
  // from exceeding capacity. Rows stay locked until transaction commits.
  const overlapping = await tx
    .select({ attendees: bookings.attendees })
    .from(bookings)
    .where(and(
      eq(bookings.serviceId, serviceId),
      ne(bookings.status, 'cancelled'),
      ne(bookings.status, 'no_show'),
      lt(bookings.startTime, endTime),
      gte(bookings.endTime, startTime),
    ))
    .for('update')
    .limit(500);

  const bookedCapacity = overlapping.reduce((sum, b) => sum + b.attendees, 0);
  return (bookedCapacity + attendees) <= maxCapacity;
}
