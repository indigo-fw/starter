/**
 * Convert a UTC date to a local datetime-local input string (YYYY-MM-DDTHH:mm).
 */
export function convertUTCToLocal(utcDate: Date | string | null): string {
  if (!utcDate) return '';
  const date = typeof utcDate === 'string' ? new Date(utcDate) : utcDate;
  if (isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Convert a datetime-local input string to a UTC ISO string.
 */
export function convertLocalToUTC(localDateString: string): string {
  if (!localDateString) return '';
  const date = new Date(localDateString);
  if (isNaN(date.getTime())) return '';
  return date.toISOString();
}

/**
 * Format a date as a locale-aware relative time string (e.g. "2 hours ago").
 * Uses Intl.RelativeTimeFormat for proper localization.
 */
export function formatRelativeTime(
  date: Date | string,
  locale?: string
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffSec = Math.round((d.getTime() - Date.now()) / 1000);

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ];

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  for (const [unit, seconds] of units) {
    if (Math.abs(diffSec) >= seconds) {
      return rtf.format(Math.round(diffSec / seconds), unit);
    }
  }

  return rtf.format(0, 'second');
}

// ─── Local-day helpers ──────────────────────────────────────────────────────
//
// Anything with a daily cadence (reminders, streaks, "today") must roll over
// at the USER's midnight, not UTC's — `user.timezone` holds their IANA zone
// (filled by <TimezoneSync>). Every helper takes the zone as stored, so a
// missing or garbage value quietly degrades to UTC instead of throwing from a
// cron job. Pure Intl; safe in client bundles too.
//
// This is the ONE implementation of "local day / local hour"; the older
// `@/core/lib/i18n/timezone` helpers are thin wrappers over these.

const DAY_MS = 24 * 60 * 60 * 1000;

// Shape gate before Intl sees the string: rejects garbage cheaply and keeps
// offset-style zones ("+05:30", accepted by newer ICU) out, so a stored value
// resolves the same way on every runtime.
const IANA_ZONE_SHAPE = /^[A-Za-z0-9_+\-/]{3,64}$/;

/** True when `tz` is an IANA zone name this runtime's Intl can resolve. */
export function isValidTimezone(tz: string): boolean {
  if (!IANA_ZONE_SHAPE.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Wall-clock reading of `d` in `timeZone`; throws RangeError on an unknown zone. */
function wallClock(timeZone: string, d: Date): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    // Some ICU builds still emit "24" at midnight despite h23
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * Wall clock in the user's zone, degrading to UTC when the zone is missing,
 * malformed or unknown to Intl. One formatter construction on the happy path
 * (no separate validity probe) — these run per user inside cron loops.
 */
function safeWallClock(
  timezone: string | null | undefined,
  d: Date
): WallClock {
  if (timezone && IANA_ZONE_SHAPE.test(timezone)) {
    try {
      return wallClock(timezone, d);
    } catch {
      // unknown zone → UTC below
    }
  }
  return wallClock('UTC', d);
}

/** Zone offset in ms at instant `d` (positive east of UTC), from the wall clock. */
function zoneOffsetMs(timeZone: string, d: Date): number {
  const w = wallClock(timeZone, d);
  const asUtc = Date.UTC(
    w.year,
    w.month - 1,
    w.day,
    w.hour,
    w.minute,
    w.second
  );
  // Parts carry whole seconds — compare against the second-truncated instant
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** The user's local calendar day as `YYYY-MM-DD` (UTC when the zone is missing/invalid). */
export function localDayStr(
  timezone: string | null | undefined,
  d: Date = new Date()
): string {
  const w = safeWallClock(timezone, d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** The hour (0–23) in the user's timezone (UTC when the zone is missing/invalid). */
export function localHour(
  timezone: string | null | undefined,
  d: Date = new Date()
): number {
  return safeWallClock(timezone, d).hour;
}

/** Weekday (Sun..Sat → 0..6) of the user's local calendar day (UTC when the zone is missing/invalid). */
export function localWeekday(
  timezone: string | null | undefined,
  d: Date = new Date()
): number {
  const w = safeWallClock(timezone, d);
  return new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
}

/**
 * The UTC instant of the user's most recent local midnight.
 *
 * Resolved from the local calendar date, then corrected with the offset in
 * force AT that midnight rather than at `now` — on a DST transition day the
 * two differ by an hour, which is exactly the day this has to get right.
 */
export function startOfLocalDayUtc(
  timezone: string | null | undefined,
  now: Date = new Date()
): Date {
  const zone = timezone && IANA_ZONE_SHAPE.test(timezone) ? timezone : 'UTC';
  try {
    const w = wallClock(zone, now);
    const naiveMidnight = Date.UTC(w.year, w.month - 1, w.day);
    const guess = naiveMidnight - zoneOffsetMs(zone, now);
    return new Date(naiveMidnight - zoneOffsetMs(zone, new Date(guess)));
  } catch {
    return new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  }
}

/**
 * Whole local calendar days from `now`'s local day to `target`'s local day
 * (0 = later today, negative = already past). Use for "expires in N days"
 * copy, where a UTC-based ceil() shows a different number depending on the
 * hour the cron happened to run.
 */
export function localDaysUntil(
  timezone: string | null | undefined,
  target: Date,
  now: Date = new Date()
): number {
  const toUtcMidnight = (day: string) => Date.parse(`${day}T00:00:00Z`);
  const from = toUtcMidnight(localDayStr(timezone, now));
  const to = toUtcMidnight(localDayStr(timezone, target));
  return Math.round((to - from) / DAY_MS);
}
