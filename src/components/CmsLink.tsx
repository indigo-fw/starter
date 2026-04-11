'use client';

import {
  CmsLink as CoreCmsLink,
  type CmsLinkProps as CoreCmsLinkProps,
} from '@/core/components/CmsLink';
import type { AppPathname } from '@/i18n/routing';

/**
 * Filter out dynamic route patterns (containing [param]) — only static paths
 * are valid for the href prop. Dynamic content should use `id` or `slug` props.
 */
type StaticPathname = {
  [K in AppPathname]: K extends `${string}[${string}]${string}` ? never : K;
}[AppPathname];

export type CmsLinkProps = CoreCmsLinkProps<StaticPathname>;

/**
 * Typed CmsLink — project wrapper that constrains `href` to valid static routes.
 *
 * @example
 * <CmsLink href="/blog">Blog</CmsLink>         // ✓ typed
 * <CmsLink href="/blogg">Blog</CmsLink>         // ✗ compile error
 * <CmsLink id="abc-uuid">About</CmsLink>        // ✓ CMS lookup
 * <CmsLink slug="about-us">About</CmsLink>      // ✓ CMS lookup
 */
export function CmsLink(props: CmsLinkProps) {
  return <CoreCmsLink {...props} />;
}
