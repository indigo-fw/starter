import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getNextCronRun } from '../infra/cron';

describe('getNextCronRun', () => {
  beforeEach(() => {
    // Fix time to 2025-06-15 10:30:00 UTC for deterministic tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T10:30:00Z'));
  });

  it('fixed daily pattern — future time today', () => {
    // 0 15 * * * → today at 15:00 (hasn't passed yet)
    const next = getNextCronRun('0 15 * * *');

    expect(next.getUTCHours()).toBe(15);
    expect(next.getUTCMinutes()).toBe(0);
    expect(next.getUTCDate()).toBe(15); // same day
  });

  it('fixed daily pattern — past time today → schedules tomorrow', () => {
    // 0 3 * * * → 03:00 already passed today
    const next = getNextCronRun('0 3 * * *');

    expect(next.getUTCHours()).toBe(3);
    expect(next.getUTCMinutes()).toBe(0);
    expect(next.getUTCDate()).toBe(16); // tomorrow
  });

  it('fixed daily pattern with minutes', () => {
    // 30 8 * * * → 08:30, already passed
    const next = getNextCronRun('30 8 * * *');

    expect(next.getUTCHours()).toBe(8);
    expect(next.getUTCMinutes()).toBe(30);
    expect(next.getUTCDate()).toBe(16);
  });

  it('step minutes with wildcard hour — */5 * * * *', () => {
    const next = getNextCronRun('*/5 * * * *');
    const expectedMs = new Date('2025-06-15T10:30:00Z').getTime() + 5 * 60 * 1000;

    expect(next.getTime()).toBe(expectedMs);
  });

  it('step minutes — */15 * * * *', () => {
    const next = getNextCronRun('*/15 * * * *');
    const expectedMs = new Date('2025-06-15T10:30:00Z').getTime() + 15 * 60 * 1000;

    expect(next.getTime()).toBe(expectedMs);
  });

  it('fixed minute with wildcard hour — 0 * * * * (hourly at :00)', () => {
    // Current time is 10:30, next :00 is 11:00
    const next = getNextCronRun('0 * * * *');

    expect(next.getUTCHours()).toBe(11);
    expect(next.getUTCMinutes()).toBe(0);
  });

  it('fixed minute with step hour — 0 */2 * * *', () => {
    const next = getNextCronRun('0 */2 * * *');
    const expectedMs = new Date('2025-06-15T10:30:00Z').getTime() + 2 * 60 * 60 * 1000;

    expect(next.getTime()).toBe(expectedMs);
  });

  it('wildcard minute + wildcard hour — every minute', () => {
    const next = getNextCronRun('* * * * *');
    const expectedMs = new Date('2025-06-15T10:30:00Z').getTime() + 60 * 1000;

    expect(next.getTime()).toBe(expectedMs);
  });

  it('falls back to 24h for incomplete patterns', () => {
    const next = getNextCronRun('bad');
    const expectedMs = new Date('2025-06-15T10:30:00Z').getTime() + 24 * 60 * 60 * 1000;

    expect(next.getTime()).toBe(expectedMs);
  });

  it('falls back to 24h for unparseable fields', () => {
    const next = getNextCronRun('x y * * *');
    const expectedMs = new Date('2025-06-15T10:30:00Z').getTime() + 24 * 60 * 60 * 1000;

    expect(next.getTime()).toBe(expectedMs);
  });
});
