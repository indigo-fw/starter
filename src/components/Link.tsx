'use client';

import {
  CmsLink,
  type CmsLinkProps as CoreCmsLinkProps,
} from '@/core/components/CmsLink';
import type { AppPathname } from '@/i18n/routing';

/**
 * Static pathnames only — excludes dynamic routes with [param] segments.
 * Dynamic content should use `id`, `slug`, or a literal path in `href`.
 */
type StaticPathname = {
  [K in AppPathname]: K extends `${string}[${string}]${string}` ? never : K;
}[AppPathname];

export type LinkProps = CoreCmsLinkProps<StaticPathname>;

/**
 * Unified link component — drop-in replacement for `<Link>`.
 *
 * `href` accepts typed static routes with autocomplete. Unrecognized paths
 * (CMS slugs, UUIDs) are auto-resolved from the database.
 *
 * @example
 * import { Link } from '@/components/Link';
 *
 * // Static — typed, instant, autocomplete
 * <Link href="/blog">Blog</Link>
 * <Link href="/pricing">Pricing</Link>
 *
 * // CMS content — auto-resolved
 * <Link href="/about-us">About</Link>
 * <Link href="cms://about-us?lang=de">Über uns</Link>
 *
 * // Explicit CMS lookup
 * <Link id="abc-uuid">About Us</Link>
 * <Link slug="about-us">About Us</Link>
 *
 * // External / dashboard — passed through
 * <Link href="https://github.com">GitHub</Link>
 * <Link href="/dashboard">Admin</Link>
 */
export function Link(props: LinkProps) {
  return <CmsLink {...props} />;
}
