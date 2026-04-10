/**
 * iCalendar (.ics) generation for booking events.
 *
 * Produces RFC 5545 compliant VCALENDAR with VEVENT and VALARM components.
 * All datetimes use UTC (DTSTART/DTEND with Z suffix) which is universally
 * supported. VTIMEZONE blocks are not needed for UTC-only events.
 */

export interface IcalBookingInput {
  id: string;
  bookingNumber: string;
  startTime: Date;
  endTime: Date;
  serviceSnapshot: Record<string, unknown> | null;
  customerNote?: string | null;
  priceCents: number;
  currency: string;
}

export interface IcalOptions {
  organizationName?: string;
  organizerEmail?: string;
  attendeeEmail?: string;
}

/**
 * Generate an iCalendar (.ics) string for a booking.
 *
 * Includes two VALARM reminders (24h and 1h before) that trigger
 * native calendar notifications on the client device.
 */
export function generateIcal(booking: IcalBookingInput, options: IcalOptions = {}): string {
  const snapshot = booking.serviceSnapshot ?? {};
  const summary = (snapshot.name as string) ?? 'Booking';
  const location = (snapshot.location as string) ?? '';
  const description = buildDescription(booking);

  const now = new Date();
  const uid = `${booking.id}@booking`;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Indigo//core-booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcalDate(now)}`,
    `DTSTART:${formatIcalDate(booking.startTime)}`,
    `DTEND:${formatIcalDate(booking.endTime)}`,
    `SUMMARY:${escapeIcalText(summary)}`,
  ];

  if (location) {
    lines.push(`LOCATION:${escapeIcalText(location)}`);
  }

  lines.push(`DESCRIPTION:${escapeIcalText(description)}`);

  // Organizer
  if (options.organizerEmail) {
    const cn = options.organizationName ? `;CN=${escapeIcalText(options.organizationName)}` : '';
    lines.push(`ORGANIZER${cn}:MAILTO:${options.organizerEmail}`);
  }

  // Attendee (the person who booked)
  if (options.attendeeEmail) {
    lines.push(`ATTENDEE;RSVP=TRUE;PARTSTAT=ACCEPTED:MAILTO:${options.attendeeEmail}`);
  }

  lines.push('STATUS:CONFIRMED');

  // VALARM: 1 hour before
  lines.push(
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcalText(summary)} starts in 1 hour`,
    'END:VALARM',
  );

  // VALARM: 24 hours before
  lines.push(
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcalText(summary)} is tomorrow`,
    'END:VALARM',
  );

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n');
}

/**
 * Format a Date to iCalendar datetime format (UTC).
 * e.g., 20260410T140000Z
 */
function formatIcalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Escape text for iCalendar field values per RFC 5545.
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
function buildDescription(booking: IcalBookingInput): string {
  const lines: string[] = [`Booking: ${booking.bookingNumber}`];

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
 * Generate a Google Calendar "Add to Calendar" URL.
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
