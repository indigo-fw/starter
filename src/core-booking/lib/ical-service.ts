import type { Booking } from '@/core-booking/schema/bookings';

/**
 * Generate an iCalendar (.ics) string for a booking.
 *
 * Produces a VEVENT that can be imported into Google Calendar, Apple Calendar,
 * Outlook, etc. Also suitable for attaching to confirmation emails.
 */
export function generateIcal(booking: {
  id: string;
  bookingNumber: string;
  startTime: Date;
  endTime: Date;
  serviceSnapshot: Record<string, unknown> | null;
  customerNote?: string | null;
  priceCents: number;
  currency: string;
}, organizationName?: string): string {
  const snapshot = booking.serviceSnapshot ?? {};
  const summary = (snapshot.name as string) ?? 'Booking';
  const location = (snapshot.location as string) ?? '';
  const description = buildDescription(booking);

  const now = new Date();
  const uid = `${booking.id}@booking`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Indigo//core-booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcalDate(now)}`,
    `DTSTART:${formatIcalDate(booking.startTime)}`,
    `DTEND:${formatIcalDate(booking.endTime)}`,
    `SUMMARY:${escapeIcalText(summary)}`,
    location ? `LOCATION:${escapeIcalText(location)}` : '',
    `DESCRIPTION:${escapeIcalText(description)}`,
    organizationName ? `ORGANIZER;CN=${escapeIcalText(organizationName)}:MAILTO:noreply@example.com` : '',
    `STATUS:CONFIRMED`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Booking reminder',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    'DESCRIPTION:Booking reminder (24h)',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

/**
 * Format a Date to iCalendar datetime format (UTC).
 * e.g., 20260410T140000Z
 */
function formatIcalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Escape text for iCalendar field values.
 */
function escapeIcalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Build a human-readable description for the calendar event.
 */
function buildDescription(booking: {
  bookingNumber: string;
  priceCents: number;
  currency: string;
  customerNote?: string | null;
}): string {
  const lines: string[] = [
    `Booking: ${booking.bookingNumber}`,
  ];

  if (booking.priceCents > 0) {
    const amount = (booking.priceCents / 100).toFixed(2);
    lines.push(`Price: ${amount} ${booking.currency.toUpperCase()}`);
  }

  if (booking.customerNote) {
    lines.push(`Note: ${booking.customerNote}`);
  }

  return lines.join('\\n');
}

/**
 * Generate a Google Calendar link for a booking.
 */
export function generateGoogleCalendarUrl(booking: {
  startTime: Date;
  endTime: Date;
  serviceSnapshot: Record<string, unknown> | null;
  bookingNumber: string;
}): string {
  const snapshot = booking.serviceSnapshot ?? {};
  const title = (snapshot.name as string) ?? 'Booking';
  const location = (snapshot.location as string) ?? '';

  const start = formatGcalDate(booking.startTime);
  const end = formatGcalDate(booking.endTime);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    details: `Booking reference: ${booking.bookingNumber}`,
    location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function formatGcalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
