'use client';

import Link from 'next/link';
import { useLocale } from '@/core/hooks/useLocale';
import { localePath } from '@/core/lib/i18n/locale';
import type { ComponentProps } from 'react';

type LocaleLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  href: string;
};

/**
 * Locale-aware Link — auto-prepends locale prefix for non-default locales.
 */
export function LocaleLink({ href, ...props }: LocaleLinkProps) {
  const locale = useLocale();
  return <Link href={localePath(href, locale)} {...props} />;
}
