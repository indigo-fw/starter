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
 * Uses Intl.DateTimeFormat to resolve the UTC offset for the given timezone
 * on the given date, then applies it. This handles DST transitions correctly.
 */
function localToUtc(date: string, time: string, timezone: string): Date {
  const [h, m] = time.split(':').map(Number) as [number, number];

  // Build a Date that *represents* the wall-clock time in the target timezone.
  // We parse as UTC first, then adjust by the timezone's offset on that date.
  const naive = new Date(`${date}T${time}:00Z`);

  // Resolve the timezone's UTC offset at this approximate instant.
  // We use the naive UTC date to get the offset — close enough for DST lookup.
  const offsetMs = getTimezoneOffsetMs(naive, timezone);

  // Local time = UTC + offset → UTC = local - offset
  return new Date(naive.getTime() - offsetMs);
}

/**
 * Get the UTC offset in milliseconds for a timezone at a given instant.
 * Positive = ahead of UTC (e.g., +02:00 → +7200000).
 */
function getTimezoneOffsetMs(at: Date, timezone: string): number {
  // Format parts in the target timezone and in UTC, compare
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const utcFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });

  const localParts = partsToDate(formatter.formatToParts(at));
  const utcParts = partsToDate(utcFormatter.formatToParts(at));

  return localParts.getTime() - utcParts.getTime();
}

function partsToDate(parts: Intl.DateTimeFormatPart[]): Date {
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  // Handle "24:00" edge case from some formatters
  const hour = map.hour === '24' ? '00' : map.hour;
  return new Date(`${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}Z`);
}

/**
 * Get the day of week for a date string in a specific timezone.
 */
function getDayOfWeekInTimezone(date: string, timezone: string): number {
  const d = new Date(`${date}T12:00:00Z`); // noon UTC to avoid date boundary issues
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
  const weekday = formatter.format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? d.getUTCDay();
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

  // Fetch schedule + override in parallel
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

  // Determine working hours
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

  // Generate UTC slots from local times
  const slots = generateSlotsUtc(date, startTime, endTime, service);
  if (slots.length === 0) return [];

  // Fetch existing bookings for this time range
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

  // Filter by capacity, advance window, and past slots
  const now = new Date();
  const availableSlots: TimeSlot[] = [];

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
 * Generate time slots in UTC from local schedule times.
 */
function generateSlotsUtc(
  date: string,
  startTime: string,
  endTime: string,
  service: BookingService,
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

// ─── Batch multi-day availability (for calendar views) ─────────────────────

/**
 * Get available dates for a service in a date range.
 *
 * Uses 3 batch queries instead of N sequential calls:
 * 1. All schedules for this service
 * 2. All overrides in the date range
 * 3. All bookings overlapping the date range
 *
 * Then computes slots in memory.
 */
export async function getAvailableDatesInRange(
  serviceId: string,
  from: string,
  to: string,
): Promise<string[]> {
  const maxDays = 62;

  // Validate dates
  const startDate = new Date(from);
  const endDate = new Date(to);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return [];

  // Fetch service
  const [service] = await db
    .select()
    .from(bookingServices)
    .where(eq(bookingServices.id, serviceId))
    .limit(1);

  if (!service || service.status !== 'published' || service.deletedAt) return [];

  // Batch fetch: schedules, overrides, and bookings — all in parallel
  // Compute the UTC range that covers the entire local date range
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

  // Iterate each date in range
  const now = new Date();
  const dates: string[] = [];
  const current = new Date(startDate);
  let dayCount = 0;

  while (current <= endDate && dayCount < maxDays) {
    const dateStr = current.toISOString().slice(0, 10);
    const override = overridesByDate.get(dateStr);

    if (override?.isUnavailable) {
      current.setDate(current.getDate() + 1);
      dayCount++;
      continue;
    }

    // Determine working hours
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
      // Generate slots and check if any are available
      const slots = generateSlotsUtc(dateStr, localStart, localEnd, service);
      const hasAvailable = slots.some((slot) => {
        if (slot.startTime <= now) return false;

        if (service.minAdvanceHours) {
          const earliest = new Date(now.getTime() + service.minAdvanceHours * 3_600_000);
          if (slot.startTime < earliest) return false;
        }
        if (service.maxAdvanceHours) {
          const latest = new Date(now.getTime() + service.maxAdvanceHours * 3_600_000);
          if (slot.startTime > latest) return false;
        }

        const bookedCapacity = allBookings
          .filter((b) => b.startTime < slot.endTime && b.endTime > slot.startTime)
          .reduce((sum, b) => sum + b.attendees, 0);

        return (service.maxCapacity - bookedCapacity) > 0;
      });

      if (hasAvailable) dates.push(dateStr);
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
 * Atomically check availability and reserve a slot within a transaction.
 * Uses SELECT ... FOR UPDATE to prevent double-booking race conditions.
 *
 * Returns the total booked capacity (including the new booking) if available,
 * or null if the slot is full.
 */
export async function reserveSlotAtomically(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  serviceId: string,
  startTime: Date,
  endTime: Date,
  attendees: number,
  maxCapacity: number,
): Promise<boolean> {
  // Lock overlapping bookings for this service to prevent concurrent inserts
  // from exceeding capacity. FOR UPDATE locks the rows until transaction commits.
  const [result] = await tx.execute(sql`
    SELECT COALESCE(SUM(attendees), 0)::int AS total
    FROM bookings
    WHERE service_id = ${serviceId}
      AND status NOT IN ('cancelled', 'no_show')
      AND start_time < ${endTime}
      AND end_time > ${startTime}
    FOR UPDATE
  `) as unknown as [{ total: number }];

  const bookedCapacity = result?.total ?? 0;
  return (bookedCapacity + attendees) <= maxCapacity;
}
