'use client';

import { type ComponentPropsWithoutRef } from 'react';
import NextLink from 'next/link';
import { useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc/client';
import { localePath } from '@/core/lib/i18n/locale';
import type { Locale } from '@/lib/constants';

export interface CmsLinkBaseProps extends Omit<ComponentPropsWithoutRef<'a'>, 'href'> {
  /** Target locale override. Default: visitor's current locale. */
  lang?: string;
}

export interface CmsLinkByIdProps extends CmsLinkBaseProps {
  /** Content UUID — preferred for stable links that survive slug changes. */
  id: string;
  slug?: string;
  href?: string;
  type?: string;
}

export interface CmsLinkBySlugProps<TPath extends string = string> extends CmsLinkBaseProps {
  id?: undefined;
  /** Content slug — resolves via DB at render time. */
  slug: string;
  /** Static fallback if slug resolution fails. */
  href?: TPath;
  /** Content type hint for slug disambiguation (page, blog, category, etc.). */
  type?: string;
}

export interface CmsLinkStaticProps<TPath extends string = string> extends CmsLinkBaseProps {
  id?: undefined;
  slug?: undefined;
  /** Static path — no DB lookup, just locale-aware rendering. */
  href: TPath;
  type?: undefined;
}

export type CmsLinkProps<TPath extends string = string> =
  | CmsLinkByIdProps
  | CmsLinkBySlugProps<TPath>
  | CmsLinkStaticProps<TPath>;

/**
 * Universal locale-aware link component.
 *
 * Three modes:
 *   1. CMS content (id/slug) — resolves via tRPC with React Query caching
 *   2. Static route (href only) — locale prefix, no DB call
 *   3. CMS with fallback (slug + href) — tries DB, falls back to href
 *
 * @example
 * // CMS content — resolved from DB
 * <CmsLink id="abc-uuid">About Us</CmsLink>
 * <CmsLink slug="about-us" lang="de">Über uns</CmsLink>
 *
 * // Static route — no DB lookup, just locale-aware
 * <CmsLink href="/blog">Blog</CmsLink>
 * <CmsLink href="/pricing">Pricing</CmsLink>
 *
 * // CMS with static fallback
 * <CmsLink slug="about-us" href="/about-us">About</CmsLink>
 */
export function CmsLink({
  id,
  slug,
  lang,
  type,
  href: staticHref,
  children,
  ...props
}: CmsLinkProps) {
  const locale = useLocale();
  const targetLocale = lang ?? locale;
  const needsQuery = !!(id || slug);

  const { data } = trpc.cmsLink.resolve.useQuery(
    { id, slug, lang, type, locale },
    {
      staleTime: 60 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      enabled: needsQuery,
    },
  );

  // Priority: resolved CMS link > static href (locale-prefixed) > nothing
  const href = data?.href
    ?? (staticHref ? localePath(staticHref, targetLocale as Locale) : undefined);
  const displayText = children ?? data?.title;

  if (!href) {
    return <span {...props}>{displayText}</span>;
  }

  return (
    <NextLink href={href} {...props}>
      {displayText}
    </NextLink>
  );
}
