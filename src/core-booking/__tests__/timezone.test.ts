import { describe, it, expect } from 'vitest';
import { localToUtc } from '@/core-booking/lib/availability-service';

describe('localToUtc', () => {
  // ─── Basic conversions ─────────────────────────────────────────────────

  it('converts UTC time correctly (offset 0)', () => {
    const result = localToUtc('2026-06-15', '14:00', 'UTC');
    expect(result.toISOString()).toBe('2026-06-15T14:00:00.000Z');
  });

  it('converts CET winter time (UTC+1)', () => {
    // January in Berlin = CET = UTC+1
    // 09:00 Berlin = 08:00 UTC
    const result = localToUtc('2026-01-15', '09:00', 'Europe/Berlin');
    expect(result.toISOString()).toBe('2026-01-15T08:00:00.000Z');
  });

  it('converts CEST summer time (UTC+2)', () => {
    // July in Berlin = CEST = UTC+2
    // 09:00 Berlin = 07:00 UTC
    const result = localToUtc('2026-07-15', '09:00', 'Europe/Berlin');
    expect(result.toISOString()).toBe('2026-07-15T07:00:00.000Z');
  });

  it('converts US Eastern winter (UTC-5)', () => {
    // January in New York = EST = UTC-5
    // 09:00 NY = 14:00 UTC
    const result = localToUtc('2026-01-15', '09:00', 'America/New_York');
    expect(result.toISOString()).toBe('2026-01-15T14:00:00.000Z');
  });

  it('converts US Eastern summer (UTC-4)', () => {
    // July in New York = EDT = UTC-4
    // 09:00 NY = 13:00 UTC
    const result = localToUtc('2026-07-15', '09:00', 'America/New_York');
    expect(result.toISOString()).toBe('2026-07-15T13:00:00.000Z');
  });

  it('converts Tokyo (UTC+9, no DST)', () => {
    // Tokyo is always UTC+9
    // 09:00 Tokyo = 00:00 UTC
    const result = localToUtc('2026-06-15', '09:00', 'Asia/Tokyo');
    expect(result.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });

  it('converts India (UTC+5:30)', () => {
    // India = UTC+5:30 year-round
    // 09:00 IST = 03:30 UTC
    const result = localToUtc('2026-06-15', '09:00', 'Asia/Kolkata');
    expect(result.toISOString()).toBe('2026-06-15T03:30:00.000Z');
  });

  it('converts Australia/Sydney summer (UTC+11)', () => {
    // January in Sydney = AEDT = UTC+11
    // 09:00 Sydney = 22:00 UTC previous day
    const result = localToUtc('2026-01-15', '09:00', 'Australia/Sydney');
    expect(result.toISOString()).toBe('2026-01-14T22:00:00.000Z');
  });

  // ─── DST transition edge cases ─────────────────────────────────────────

  it('handles time just before spring-forward (Europe/Berlin)', () => {
    // Berlin springs forward on last Sunday of March at 02:00 → 03:00
    // 2026-03-29 is the spring-forward date
    // 01:00 Berlin (still CET, UTC+1) = 00:00 UTC
    const result = localToUtc('2026-03-29', '01:00', 'Europe/Berlin');
    expect(result.toISOString()).toBe('2026-03-29T00:00:00.000Z');
  });

  it('handles time just after spring-forward (Europe/Berlin)', () => {
    // After spring-forward: 03:00 Berlin (now CEST, UTC+2) = 01:00 UTC
    const result = localToUtc('2026-03-29', '03:00', 'Europe/Berlin');
    expect(result.toISOString()).toBe('2026-03-29T01:00:00.000Z');
  });

  it('handles spring-forward gap hour gracefully (Europe/Berlin)', () => {
    // 02:30 Berlin on spring-forward day doesn't exist (clocks jump 02:00→03:00)
    // Should produce a reasonable result (snapped to 03:30 CEST = 01:30 UTC
    // or 02:30 CET = 01:30 UTC — either is acceptable)
    const result = localToUtc('2026-03-29', '02:30', 'Europe/Berlin');
    // The result should be a valid Date in the right neighborhood
    const utcHour = result.getUTCHours();
    const utcMinutes = result.getUTCMinutes();
    // Should be 00:30 or 01:30 UTC (either interpretation is valid)
    expect(utcHour).toBeGreaterThanOrEqual(0);
    expect(utcHour).toBeLessThanOrEqual(1);
    expect(utcMinutes).toBe(30);
  });

  it('handles time just before fall-back (Europe/Berlin)', () => {
    // Berlin falls back on last Sunday of October at 03:00 → 02:00
    // 2026-10-25 is the fall-back date
    // 02:30 Berlin first occurrence (still CEST, UTC+2) = 00:30 UTC
    const result = localToUtc('2026-10-25', '02:30', 'Europe/Berlin');
    const utcHour = result.getUTCHours();
    // Could be 00:30 (CEST) or 01:30 (CET) — first occurrence expected
    expect(utcHour).toBeGreaterThanOrEqual(0);
    expect(utcHour).toBeLessThanOrEqual(1);
    expect(result.getUTCMinutes()).toBe(30);
  });

  // ─── Boundary times ────────────────────────────────────────────────────

  it('handles midnight (00:00)', () => {
    const result = localToUtc('2026-06-15', '00:00', 'Europe/Berlin');
    // 00:00 CEST = 22:00 UTC previous day
    expect(result.toISOString()).toBe('2026-06-14T22:00:00.000Z');
  });

  it('handles end of day (23:59)', () => {
    const result = localToUtc('2026-06-15', '23:59', 'Europe/Berlin');
    // 23:59 CEST = 21:59 UTC same day
    expect(result.toISOString()).toBe('2026-06-15T21:59:00.000Z');
  });

  // ─── US spring-forward (March second Sunday) ───────────────────────────

  it('handles US spring-forward gap (America/New_York)', () => {
    // 2026-03-08 is second Sunday of March — clocks jump 02:00→03:00
    // 02:30 doesn't exist
    const result = localToUtc('2026-03-08', '02:30', 'America/New_York');
    // Should produce a valid date in the right neighborhood
    expect(result).toBeInstanceOf(Date);
    expect(isNaN(result.getTime())).toBe(false);
    // Should be around 07:00-08:00 UTC
    const utcHour = result.getUTCHours();
    expect(utcHour).toBeGreaterThanOrEqual(6);
    expect(utcHour).toBeLessThanOrEqual(8);
  });

  it('handles US time just after spring-forward', () => {
    // 03:00 EDT (UTC-4) = 07:00 UTC
    const result = localToUtc('2026-03-08', '03:00', 'America/New_York');
    expect(result.toISOString()).toBe('2026-03-08T07:00:00.000Z');
  });
});
