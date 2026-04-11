'use client';

import '@/config/cms-link-init'; // Populate static routes + passthrough config on client
import {
  CmsLink,
  type CmsLinkProps as CoreCmsLinkProps,
} from '@/core/components/CmsLink';
import type { AppPathname } from '@/i18n/routing';

/**
 * Static pathnames only — excludes dynamic routes with [param] segments.
 * Used for string href autocomplete (you wouldn't write href="/blog/[slug]").
 */
type StaticPathname = {
  [K in AppPathname]: K extends `${string}[${string}]${string}` ? never : K;
}[AppPathname];

/**
 * TPath = StaticPathname — string href autocomplete (excludes dynamic segments)
 * TPathname = AppPathname — object href pathname autocomplete (includes dynamic segments)
 */
export type LinkProps = CoreCmsLinkProps<StaticPathname, AppPathname>;

/**
 * Unified link component — drop-in replacement for `<Link>`.
 *
 * @example
 * import { Link } from '@/components/Link';
 *
 * // Static string — typed autocomplete, no DB call
 * <Link href="/blog">Blog</Link>
 * <Link href="/pricing">Pricing</Link>
 *
 * // Dynamic with params — typed pathname autocomplete
 * <Link href={{ pathname: '/blog/[slug]', params: { slug: 'my-post' } }}>Post</Link>
 * <Link href={{ pathname: '/blog', query: { page: '2' } }}>Page 2</Link>
 *
 * // CMS content — auto-resolved from DB
 * <Link href="/about-us">About</Link>
 * <Link href="cms://about-us?lang=de">Über uns</Link>
 *
 * // Explicit CMS lookup
 * <Link id="abc-uuid">About Us</Link>
 * <Link slug="about-us" lang="de">Über uns</Link>
 *
 * // Passthrough — no locale prefix, no DB call
 * <Link href="https://github.com">GitHub</Link>
 * <Link href="/dashboard">Admin</Link>
 *
 * // Next.js Link props
 * <Link href="/blog" scroll={false} prefetch={false}>Blog</Link>
 */
export function Link(props: LinkProps) {
  return <CmsLink {...props} />;
}
