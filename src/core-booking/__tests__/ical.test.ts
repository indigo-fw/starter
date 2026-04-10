import { describe, it, expect } from 'vitest';
import { generateIcal, generateGoogleCalendarUrl } from '@/core-booking/lib/ical-service';

const BASE_BOOKING = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  bookingNumber: 'BOOK-20260410-0001',
  startTime: new Date('2026-04-10T14:00:00Z'),
  endTime: new Date('2026-04-10T15:00:00Z'),
  serviceSnapshot: { name: 'Strategy Session', location: 'Room 201', durationMinutes: 60, type: 'appointment' },
  customerNote: 'Please prepare agenda',
  priceCents: 14900,
  currency: 'EUR',
};

describe('iCal generation', () => {
  it('produces valid VCALENDAR structure', () => {
    const ical = generateIcal(BASE_BOOKING);

    expect(ical).toContain('BEGIN:VCALENDAR');
    expect(ical).toContain('END:VCALENDAR');
    expect(ical).toContain('BEGIN:VEVENT');
    expect(ical).toContain('END:VEVENT');
    expect(ical).toContain('VERSION:2.0');
    expect(ical).toContain('PRODID:-//Indigo//core-booking//EN');
  });

  it('includes correct DTSTART and DTEND in UTC', () => {
    const ical = generateIcal(BASE_BOOKING);

    expect(ical).toContain('DTSTART:20260410T140000Z');
    expect(ical).toContain('DTEND:20260410T150000Z');
  });

  it('includes summary from service snapshot', () => {
    const ical = generateIcal(BASE_BOOKING);
    expect(ical).toContain('SUMMARY:Strategy Session');
  });

  it('includes location from service snapshot', () => {
    const ical = generateIcal(BASE_BOOKING);
    expect(ical).toContain('LOCATION:Room 201');
  });

  it('includes booking number in description', () => {
    const ical = generateIcal(BASE_BOOKING);
    expect(ical).toContain('BOOK-20260410-0001');
  });

  it('includes price in description', () => {
    const ical = generateIcal(BASE_BOOKING);
    expect(ical).toContain('149.00 EUR');
  });

  it('includes customer note in description', () => {
    const ical = generateIcal(BASE_BOOKING);
    expect(ical).toContain('Please prepare agenda');
  });

  it('includes two VALARM reminders', () => {
    const ical = generateIcal(BASE_BOOKING);
    const alarmCount = (ical.match(/BEGIN:VALARM/g) ?? []).length;
    expect(alarmCount).toBe(2);
    expect(ical).toContain('TRIGGER:-PT1H');
    expect(ical).toContain('TRIGGER:-P1D');
  });

  it('includes UID from booking id', () => {
    const ical = generateIcal(BASE_BOOKING);
    expect(ical).toContain(`UID:${BASE_BOOKING.id}@booking`);
  });

  it('includes organizer when provided', () => {
    const ical = generateIcal(BASE_BOOKING, {
      organizationName: 'Acme Corp',
      organizerEmail: 'bookings@acme.com',
    });
    expect(ical).toContain('ORGANIZER;CN=Acme Corp:MAILTO:bookings@acme.com');
  });

  it('includes attendee when provided', () => {
    const ical = generateIcal(BASE_BOOKING, {
      attendeeEmail: 'customer@example.com',
    });
    expect(ical).toContain('ATTENDEE;RSVP=TRUE;PARTSTAT=ACCEPTED:MAILTO:customer@example.com');
  });

  it('omits organizer/attendee when not provided', () => {
    const ical = generateIcal(BASE_BOOKING);
    expect(ical).not.toContain('ORGANIZER');
    expect(ical).not.toContain('ATTENDEE');
  });

  it('omits location when null in snapshot', () => {
    const ical = generateIcal({ ...BASE_BOOKING, serviceSnapshot: { name: 'Call' } });
    expect(ical).not.toContain('LOCATION');
  });

  it('omits price when free', () => {
    const ical = generateIcal({ ...BASE_BOOKING, priceCents: 0 });
    expect(ical).not.toContain('Price:');
  });

  it('escapes special characters', () => {
    const booking = {
      ...BASE_BOOKING,
      serviceSnapshot: { name: 'Meeting; with, commas\\slashes' },
    };
    const ical = generateIcal(booking);
    expect(ical).toContain('SUMMARY:Meeting\\; with\\, commas\\\\slashes');
  });

  it('uses CRLF line endings', () => {
    const ical = generateIcal(BASE_BOOKING);
    expect(ical).toContain('\r\n');
    // Should NOT have bare LF without CR
    const withoutCrlf = ical.replace(/\r\n/g, '');
    expect(withoutCrlf).not.toContain('\n');
  });
});

describe('Google Calendar URL', () => {
  it('generates a valid URL', () => {
    const url = generateGoogleCalendarUrl(BASE_BOOKING);
    expect(url).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  });

  it('includes title from service snapshot', () => {
    const url = generateGoogleCalendarUrl(BASE_BOOKING);
    expect(url).toContain('text=Strategy+Session');
  });

  it('includes date range', () => {
    const url = generateGoogleCalendarUrl(BASE_BOOKING);
    expect(url).toContain('20260410T140000Z');
    expect(url).toContain('20260410T150000Z');
  });

  it('includes booking number in details', () => {
    const url = generateGoogleCalendarUrl(BASE_BOOKING);
    expect(url).toContain('BOOK-20260410-0001');
  });

  it('includes location', () => {
    const url = generateGoogleCalendarUrl(BASE_BOOKING);
    expect(url).toContain('location=Room+201');
  });
});
