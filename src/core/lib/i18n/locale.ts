import { DEFAULT_LOCALE } from '@/lib/constants';
import type { Locale } from '@/lib/constants';

/**
 * Prepend locale prefix to a path for non-default locales.
 * Default locale paths have no prefix.
 */
export function localePath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `/${locale}${normalized}`;
}
