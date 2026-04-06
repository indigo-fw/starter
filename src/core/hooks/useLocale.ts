'use client';

import { usePathname } from 'next/navigation';
import { LOCALES, DEFAULT_LOCALE } from '@/lib/constants';
import type { Locale } from '@/lib/constants';

/**
 * Client hook: detect current locale from the URL pathname.
 * Non-default locales appear as the first path segment (e.g. /de/blog).
 */
export function useLocale(): Locale {
  const pathname = usePathname();
  const firstSegment = pathname.split('/')[1];
  if (firstSegment && (LOCALES as readonly string[]).includes(firstSegment) && firstSegment !== DEFAULT_LOCALE) {
    return firstSegment as Locale;
  }
  return DEFAULT_LOCALE;
}
