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
 *
 * Kept as public API; every helper here is a "now"-only wrapper over the
 * single implementation in `@/core/lib/infra/datetime`, which also takes an
 * explicit `Date` — prefer those names in new code.
 */
import {
  isValidTimezone,
  localDayStr,
  localHour,
  localWeekday,
} from '@/core/lib/infra/datetime';

export { isValidTimezone };

/**
 * YYYY-MM-DD for "now" in the given IANA timezone (or UTC if null/invalid).
 * @deprecated Use `localDayStr(tz)` from `@/core/lib/infra/datetime`.
 */
export function todayInTimezone(tz: string | null | undefined): string {
  return localDayStr(tz);
}

/**
 * Hour-of-day (0–23) for "now" in the given IANA timezone (or UTC if null/invalid).
 * @deprecated Use `localHour(tz)` from `@/core/lib/infra/datetime`.
 */
export function hourInTimezone(tz: string | null | undefined): number {
  return localHour(tz);
}

/**
 * Weekday (Sun..Sat → 0..6) for "now" in the given IANA timezone (or UTC if null/invalid).
 * @deprecated Use `localWeekday(tz)` from `@/core/lib/infra/datetime`.
 */
export function weekdayInTimezone(tz: string | null | undefined): number {
  return localWeekday(tz);
}
