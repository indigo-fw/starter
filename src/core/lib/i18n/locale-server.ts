import { headers } from 'next/headers';
import { DEFAULT_LOCALE, LOCALES } from '@/lib/constants';
import type { Locale } from '@/lib/constants';

/**
 * Server-side: read locale from x-locale header (set by proxy).
 */
export async function getLocale(): Promise<Locale> {
  const h = await headers();
  const raw = h.get('x-locale') ?? DEFAULT_LOCALE;
  if (LOCALES.includes(raw as Locale)) return raw as Locale;
  return DEFAULT_LOCALE;
}
