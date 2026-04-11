'use client';

import { type ComponentPropsWithoutRef } from 'react';
import NextLink from 'next/link';
import { useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc/client';

interface CmsLinkProps extends Omit<ComponentPropsWithoutRef<'a'>, 'href'> {
  /** Content UUID — preferred for stable links that survive slug changes. */
  id?: string;
  /** Content slug — convenience for hand-written markdown, resolves at render time. */
  slug?: string;
  /** Target locale override. Default: visitor's current locale. */
  lang?: string;
  /** Content type hint for slug disambiguation (page, blog, category, etc.). */
  type?: string;
  /** Fallback href shown while loading or if resolution fails. */
  fallbackHref?: string;
}

/**
 * Client component that resolves a cms:// link and renders a Next.js <Link>.
 *
 * Uses tRPC with React Query caching — repeated renders of the same link
 * resolve from memory. Multiple CmsLinks on one page are automatically
 * batched into a single HTTP request via httpBatchLink.
 *
 * @example
 * <CmsLink id="abc-uuid">About Us</CmsLink>
 * <CmsLink slug="about-us" lang="de">Über uns</CmsLink>
 * <CmsLink slug="pricing" className="btn btn-primary" />
 */
export function CmsLink({
  id,
  slug,
  lang,
  type,
  fallbackHref,
  children,
  ...props
}: CmsLinkProps) {
  const locale = useLocale();

  const { data } = trpc.cmsLink.resolve.useQuery(
    { id, slug, lang, type, locale },
    {
      staleTime: 60 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      enabled: !!(id || slug),
    },
  );

  const href = data?.href ?? fallbackHref;
  const displayText = children ?? data?.title;

  // No link target resolved and no fallback — render as plain text
  if (!href) {
    return <span {...props}>{displayText}</span>;
  }

  return (
    <NextLink href={href} {...props}>
      {displayText}
    </NextLink>
  );
}
