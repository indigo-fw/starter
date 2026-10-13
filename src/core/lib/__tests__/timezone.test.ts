import {
  hourInTimezone,
  isValidTimezone,
  todayInTimezone,
  weekdayInTimezone,
} from '../i18n/timezone';
import {
  isValidTimezone as isValidTimezoneDirect,
  localDayStr,
  localHour,
  localWeekday,
} from '../infra/datetime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 23:30Z on Sunday 2026-06-21: already Monday morning in Tokyo, still Sunday
// afternoon in Los Angeles (PDT) — the two directions a "today" helper can be
// wrong in.
const NOW = new Date('2026-06-21T23:30:00Z');

const ZONES: Array<string | null> = [
  'Asia/Tokyo',
  'America/Los_Angeles',
  'UTC',
  'Not/AReal_Zone',
  null,
];

describe('i18n/timezone wrappers delegate to infra/datetime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(ZONES)('todayInTimezone(%j) === localDayStr(%j, now)', (tz) => {
    expect(todayInTimezone(tz)).toBe(localDayStr(tz, NOW));
  });

  it.each(ZONES)('hourInTimezone(%j) === localHour(%j, now)', (tz) => {
    expect(hourInTimezone(tz)).toBe(localHour(tz, NOW));
  });

  it.each(ZONES)('weekdayInTimezone(%j) === localWeekday(%j, now)', (tz) => {
    expect(weekdayInTimezone(tz)).toBe(localWeekday(tz, NOW));
  });

  it('re-exports the same isValidTimezone', () => {
    expect(isValidTimezone).toBe(isValidTimezoneDirect);
  });

  it('pins the expected values so the delegation cannot be vacuously equal', () => {
    expect(todayInTimezone('Asia/Tokyo')).toBe('2026-06-22');
    expect(hourInTimezone('Asia/Tokyo')).toBe(8);
    expect(weekdayInTimezone('Asia/Tokyo')).toBe(1); // Monday

    expect(todayInTimezone('America/Los_Angeles')).toBe('2026-06-21');
    expect(hourInTimezone('America/Los_Angeles')).toBe(16);
    expect(weekdayInTimezone('America/Los_Angeles')).toBe(0); // Sunday

    expect(todayInTimezone('UTC')).toBe('2026-06-21');
    expect(hourInTimezone('UTC')).toBe(23);
    expect(weekdayInTimezone('UTC')).toBe(0);
  });

  it('falls back to UTC for invalid, null and undefined zones', () => {
    for (const tz of ['Not/AReal_Zone', '', null, undefined]) {
      expect(todayInTimezone(tz)).toBe('2026-06-21');
      expect(hourInTimezone(tz)).toBe(23);
      expect(weekdayInTimezone(tz)).toBe(0);
    }
  });

  it('reports local midnight as hour 0, never 24', () => {
    vi.setSystemTime(new Date('2026-06-21T04:00:00Z')); // 00:00 EDT
    expect(hourInTimezone('America/New_York')).toBe(0);
  });
});
