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

/**
 * Server-side: the original request query string ("?utm_source=x" or ""),
 * forwarded by proxy as x-search. Server redirects should append it so
 * campaign params (utm_*, gclid, ref) survive - analytics only fire on the
 * final URL, so a redirect that drops the query breaks attribution.
 */
export async function getForwardedSearch(): Promise<string> {
  const h = await headers();
  const raw = h.get('x-search') ?? '';
  return raw.startsWith('?') ? raw : '';
}
