import { DEFAULT_LOCALE } from '@/lib/constants';
import type { Locale } from '@/lib/constants';

/**
 * Prepend locale prefix to a path for non-default locales.
 * Default locale paths have no prefix.
 * Handles paths with or without leading slash, query strings, and fragments.
 */
export function localePath(path: string, locale: Locale): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return normalized;
  return `/${locale}${normalized}`;
}
