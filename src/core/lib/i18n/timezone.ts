/**
 * Timezone-aware "today" — for daily cadence features (digests, briefings,
 * "today's items"), where a user in UTC+11 should roll over at *their*
 * midnight, not UTC's.
 *
 * `user.timezone` (in the schema) stores IANA names like "Europe/Berlin".
 * Populate it with `<TimezoneSync>` (src/core/components/TimezoneSync.tsx).
 *
 *   todayInTimezone('Asia/Tokyo')  // "2026-05-13" while UTC is still 2026-05-12
 *   todayInTimezone(null)          // falls back to UTC
 */

/** YYYY-MM-DD for "now" in the given IANA timezone (or UTC if null/invalid). */
export function todayInTimezone(tz: string | null | undefined): string {
  const zone = tz && isValidTimezone(tz) ? tz : 'UTC';
  // en-CA's date format is YYYY-MM-DD natively.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Hour-of-day (0–23) for "now" in the given IANA timezone. */
export function hourInTimezone(tz: string | null | undefined): number {
  const zone = tz && isValidTimezone(tz) ? tz : 'UTC';
  return parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hour12: false }).format(new Date()),
    10,
  );
}

/** Three-letter weekday abbrev (Sun..Sat → 0..6) for "now" in the given TZ. */
export function weekdayInTimezone(tz: string | null | undefined): number {
  const zone = tz && isValidTimezone(tz) ? tz : 'UTC';
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short' }).format(new Date());
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[name] ?? 0;
}

export function isValidTimezone(tz: string): boolean {
  if (!/^[A-Za-z0-9_+\-/]{3,64}$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
