import {
  isValidTimezone,
  localDayStr,
  localDaysUntil,
  localHour,
  localWeekday,
  startOfLocalDayUtc,
} from '../infra/datetime';
import { describe, expect, it } from 'vitest';

describe('isValidTimezone', () => {
  it('accepts IANA names Intl can resolve', () => {
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Asia/Tokyo')).toBe(true);
    expect(isValidTimezone('America/Argentina/Buenos_Aires')).toBe(true);
    expect(isValidTimezone('Etc/GMT+5')).toBe(true);
  });

  it('rejects unknown zones and malformed strings without throwing', () => {
    expect(isValidTimezone('Not/AReal_Zone')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
    expect(isValidTimezone('Europe Berlin')).toBe(false);
    expect(isValidTimezone('a'.repeat(65))).toBe(false);
  });

  it('rejects offset-style zones even where ICU would accept them', () => {
    // Stored values must resolve identically on every runtime
    expect(isValidTimezone('+05:30')).toBe(false);
  });
});

describe('invalid zones never throw and resolve to UTC consistently', () => {
  const d = new Date('2026-06-21T17:45:30Z');
  const bad = [
    'Not/AReal_Zone',
    '+05:30',
    'Europe Berlin',
    '',
    null,
    undefined,
  ];

  it.each(bad)('every helper falls back to UTC for %j', (tz) => {
    expect(localDayStr(tz, d)).toBe('2026-06-21');
    expect(localHour(tz, d)).toBe(17);
    expect(localWeekday(tz, d)).toBe(0);
    expect(startOfLocalDayUtc(tz, d).toISOString()).toBe(
      '2026-06-21T00:00:00.000Z'
    );
    expect(localDaysUntil(tz, new Date('2026-06-28T00:00:00Z'), d)).toBe(7);
  });
});

describe('localWeekday', () => {
  it('returns Sun..Sat as 0..6 for the local calendar day', () => {
    // 2026-06-21 is a Sunday; Tokyo is already Monday at 23:30Z
    expect(localWeekday('UTC', new Date('2026-06-21T23:30:00Z'))).toBe(0);
    expect(localWeekday('Asia/Tokyo', new Date('2026-06-21T23:30:00Z'))).toBe(
      1
    );
    // 00:30Z Monday is still Sunday evening in New York
    expect(
      localWeekday('America/New_York', new Date('2026-06-22T00:30:00Z'))
    ).toBe(0);
    expect(localWeekday('UTC', new Date('2026-06-27T12:00:00Z'))).toBe(6);
  });

  it('falls back to the UTC weekday for an invalid zone', () => {
    expect(localWeekday('Mars/Olympus', new Date('2026-06-22T00:30:00Z'))).toBe(
      1
    );
  });
});

describe('localDayStr', () => {
  it('formats the UTC day', () => {
    expect(localDayStr('UTC', new Date('2026-06-21T12:00:00Z'))).toBe(
      '2026-06-21'
    );
  });

  it('falls back to UTC for null / empty / invalid timezones', () => {
    const d = new Date('2026-06-21T12:00:00Z');
    expect(localDayStr(null, d)).toBe('2026-06-21');
    expect(localDayStr(undefined, d)).toBe('2026-06-21');
    expect(localDayStr('', d)).toBe('2026-06-21');
    expect(localDayStr('Not/AReal_Zone', d)).toBe('2026-06-21');
  });

  it('US/Eastern just after UTC midnight is still the previous local day', () => {
    // 00:30 UTC on the 22nd = 20:30 on the 21st in New York (EDT, UTC-4)
    expect(
      localDayStr('America/New_York', new Date('2026-06-22T00:30:00Z'))
    ).toBe('2026-06-21');
  });

  it('Tokyo before UTC midnight is already the next local day', () => {
    expect(localDayStr('Asia/Tokyo', new Date('2026-06-21T23:30:00Z'))).toBe(
      '2026-06-22'
    );
  });

  it('Kiritimati (UTC+14) is a full day ahead near UTC noon', () => {
    expect(
      localDayStr('Pacific/Kiritimati', new Date('2026-06-21T11:00:00Z'))
    ).toBe('2026-06-22');
  });
});

describe('localHour', () => {
  it('returns the hour in the user timezone (0-23)', () => {
    expect(localHour('Asia/Tokyo', new Date('2026-06-21T23:30:00Z'))).toBe(8);
    expect(
      localHour('America/New_York', new Date('2026-06-22T00:30:00Z'))
    ).toBe(20);
    expect(localHour('UTC', new Date('2026-06-21T17:00:00Z'))).toBe(17);
  });

  it('reports local midnight as hour 0, never 24', () => {
    // 04:00 UTC = 00:00 EDT
    expect(
      localHour('America/New_York', new Date('2026-06-21T04:00:00Z'))
    ).toBe(0);
    expect(localHour('UTC', new Date('2026-06-21T00:00:00Z'))).toBe(0);
  });

  it('falls back to the UTC hour for an invalid zone', () => {
    expect(localHour('Mars/Olympus', new Date('2026-06-21T17:00:00Z'))).toBe(
      17
    );
  });
});

describe('startOfLocalDayUtc', () => {
  it('returns the UTC instant of the user local midnight', () => {
    // NY local day of 2026-06-22T00:30Z is the 21st; 00:00 EDT on the 21st = 04:00Z
    expect(
      startOfLocalDayUtc(
        'America/New_York',
        new Date('2026-06-22T00:30:00Z')
      ).toISOString()
    ).toBe('2026-06-21T04:00:00.000Z');
  });

  it('UTC zone → UTC midnight (seconds/ms zeroed)', () => {
    expect(
      startOfLocalDayUtc(
        'UTC',
        new Date('2026-06-21T17:45:30.123Z')
      ).toISOString()
    ).toBe('2026-06-21T00:00:00.000Z');
  });

  it('positive-offset zones land on the previous UTC date', () => {
    // 08:30 JST on the 22nd; midnight JST on the 22nd = 15:00Z on the 21st
    expect(
      startOfLocalDayUtc(
        'Asia/Tokyo',
        new Date('2026-06-21T23:30:00Z')
      ).toISOString()
    ).toBe('2026-06-21T15:00:00.000Z');
  });

  it('uses the offset in force at midnight on the spring-forward day', () => {
    // 2026-03-08: NY jumps 02:00 EST → 03:00 EDT at 07:00Z. At noon UTC the
    // zone is already EDT (-4), but midnight that morning was still EST (-5).
    expect(
      startOfLocalDayUtc(
        'America/New_York',
        new Date('2026-03-08T12:00:00Z')
      ).toISOString()
    ).toBe('2026-03-08T05:00:00.000Z');
  });

  it('uses the offset in force at midnight on the fall-back day', () => {
    // 2026-11-01: NY falls back at 06:00Z. At noon UTC it is EST (-5), but
    // midnight that morning was EDT (-4) → 04:00Z.
    expect(
      startOfLocalDayUtc(
        'America/New_York',
        new Date('2026-11-01T12:00:00Z')
      ).toISOString()
    ).toBe('2026-11-01T04:00:00.000Z');
  });

  it('falls back to UTC midnight for an invalid zone', () => {
    expect(
      startOfLocalDayUtc(
        'Nope/Nowhere',
        new Date('2026-06-21T17:45:30Z')
      ).toISOString()
    ).toBe('2026-06-21T00:00:00.000Z');
  });
});

describe('localDaysUntil', () => {
  const now = new Date('2026-10-13T23:30:00Z');

  it('counts local calendar days, not 24 h blocks', () => {
    // 30 min later in UTC is already tomorrow → 1 day in UTC terms
    expect(localDaysUntil('UTC', new Date('2026-10-14T00:00:00Z'), now)).toBe(
      1
    );
    // …but still the same evening in New York (19:30 → 20:00 local)
    expect(
      localDaysUntil('America/New_York', new Date('2026-10-14T00:00:00Z'), now)
    ).toBe(0);
  });

  it('is zero for later today and negative once past', () => {
    expect(localDaysUntil('UTC', new Date('2026-10-13T23:59:00Z'), now)).toBe(
      0
    );
    expect(localDaysUntil('UTC', new Date('2026-10-12T00:00:00Z'), now)).toBe(
      -1
    );
  });

  it('spans a DST transition without rounding drift', () => {
    const before = new Date('2026-03-07T12:00:00Z');
    const after = new Date('2026-03-10T12:00:00Z');
    expect(localDaysUntil('America/New_York', after, before)).toBe(3);
  });

  it('falls back to UTC for an invalid zone', () => {
    expect(
      localDaysUntil('Bad/Zone', new Date('2026-10-20T00:00:00Z'), now)
    ).toBe(7);
  });
});
