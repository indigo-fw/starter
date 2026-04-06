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
export function formatRelativeTime(date: Date | string, locale?: string): string {
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
