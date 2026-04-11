'use client';

import { type ComponentPropsWithoutRef } from 'react';
import NextLink from 'next/link';
import { useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc/client';
import { localePath } from '@/core/lib/i18n/locale';
import { isStaticRoute, parseCmsUri } from '@/core/lib/content/cms-link';
import type { Locale } from '@/lib/constants';

// ─── Href Detection ─────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const enum HrefKind {
  /** Known static route — no DB call, just locale prefix. */
  Static,
  /** UUID detected after slash — resolve by ID. */
  Id,
  /** cms:// protocol — parse and resolve. */
  CmsProtocol,
  /** Unknown path — try slug lookup, fallback to literal. */
  Slug,
  /** External or non-locale path (/dashboard, /api, http://) — pass through as-is. */
  Passthrough,
}

interface ParsedHref {
  kind: HrefKind;
  /** Original href value */
  raw: string;
  /** Extracted identifier (UUID or slug) — without leading slash */
  identifier?: string;
}

/** Non-locale prefixes that should pass through without resolution. */
const PASSTHROUGH_PREFIXES = ['/dashboard', '/api/', 'http://', 'https://', 'mailto:', '#'];

function classifyHref(href: string): ParsedHref {
  // External URLs, dashboard, API routes — pass through
  for (const prefix of PASSTHROUGH_PREFIXES) {
    if (href.startsWith(prefix)) return { kind: HrefKind.Passthrough, raw: href };
  }

  // cms:// protocol
  if (href.startsWith('cms://')) return { kind: HrefKind.CmsProtocol, raw: href };

  // Known static route — exact match against registered pathnames
  if (isStaticRoute(href)) return { kind: HrefKind.Static, raw: href };

  // Extract the identifier after the leading slash
  const withoutSlash = href.replace(/^\//, '');

  // UUID detection
  if (UUID_RE.test(withoutSlash)) {
    return { kind: HrefKind.Id, raw: href, identifier: withoutSlash };
  }

  // Everything else — treat as slug
  return { kind: HrefKind.Slug, raw: href, identifier: withoutSlash };
}

// ─── Props ──────────────────────────────────────────────────────────────────

export interface CmsLinkBaseProps<TPath extends string = string>
  extends Omit<ComponentPropsWithoutRef<'a'>, 'href'> {
  /**
   * Link target. Accepts:
   *   - Static route: `/blog`, `/pricing` — instant, no DB call
   *   - CMS slug: `/about-us` — resolved from DB with locale chain
   *   - UUID: `/3f2a1b4c-...-uuid` — resolved from DB by ID
   *   - cms:// protocol: `cms://about-us?lang=de` — full protocol syntax
   *   - External: `https://...` — passed through as-is
   *   - Dashboard: `/dashboard/...` — passed through, no locale prefix
   */
  href?: TPath | `/${string}` | `cms://${string}`;
  /** Explicit content UUID — skips auto-detection, goes straight to ID lookup. */
  id?: string;
  /** Explicit content slug — skips auto-detection, goes straight to slug lookup. */
  slug?: string;
  /** Target locale override. Default: visitor's current locale. */
  lang?: string;
  /** Content type hint for slug disambiguation (page, blog, category, etc.). */
  type?: string;
}

export type CmsLinkProps<TPath extends string = string> = CmsLinkBaseProps<TPath>;

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Universal locale-aware link component.
 *
 * Drop-in replacement for `<Link>` — handles static routes, CMS content,
 * and external URLs through a single `href` prop.
 *
 * Resolution priority:
 *   1. Explicit `id` or `slug` prop → DB lookup (skip href auto-detection)
 *   2. Passthrough prefix (/dashboard, /api, http://) → render as-is
 *   3. cms:// protocol → parse and resolve from DB
 *   4. Known static route → locale prefix, no DB call
 *   5. UUID in path → DB lookup by ID, fallback to literal href
 *   6. Unknown path → DB lookup by slug, fallback to literal href
 *
 * @example
 * // Static routes — typed, instant, no DB call
 * <Link href="/blog">Blog</Link>
 * <Link href="/pricing">Pricing</Link>
 *
 * // CMS content — auto-detected, resolved from DB
 * <Link href="/about-us">About Us</Link>
 * <Link href="cms://about-us?lang=de">Über uns</Link>
 *
 * // Explicit lookups
 * <Link id="abc-uuid">About Us</Link>
 * <Link slug="about-us" lang="de">Über uns</Link>
 *
 * // External / dashboard — passed through
 * <Link href="https://github.com">GitHub</Link>
 * <Link href="/dashboard/cms/pages">Admin</Link>
 */
export function CmsLink<TPath extends string = string>({
  href,
  id,
  slug,
  lang,
  type,
  children,
  ...props
}: CmsLinkProps<TPath>) {
  const locale = useLocale();
  const targetLocale = (lang ?? locale) as Locale;

  // ── Explicit id/slug props take priority over href auto-detection ──

  if (id || slug) {
    return (
      <CmsLinkResolved
        id={id}
        slug={slug}
        lang={lang}
        type={type}
        locale={locale}
        targetLocale={targetLocale}
        fallbackHref={href}
        {...props}
      >
        {children}
      </CmsLinkResolved>
    );
  }

  // ── No href at all — render as span ──

  if (!href) {
    return <span {...props}>{children}</span>;
  }

  // ── Classify the href ──

  const parsed = classifyHref(href);

  switch (parsed.kind) {
    case HrefKind.Passthrough:
      return (
        <NextLink href={href} {...props}>
          {children}
        </NextLink>
      );

    case HrefKind.Static:
      return (
        <NextLink href={localePath(href, targetLocale)} {...props}>
          {children}
        </NextLink>
      );

    case HrefKind.CmsProtocol: {
      const ref = parseCmsUri(href);
      return (
        <CmsLinkResolved
          id={ref?.id}
          slug={ref?.slug}
          lang={ref?.lang ?? lang}
          type={ref?.type ?? type}
          fragment={ref?.fragment}
          locale={locale}
          targetLocale={targetLocale}
          fallbackHref={href}
          {...props}
        >
          {children}
        </CmsLinkResolved>
      );
    }

    case HrefKind.Id:
      return (
        <CmsLinkResolved
          id={parsed.identifier}
          lang={lang}
          type={type}
          locale={locale}
          targetLocale={targetLocale}
          fallbackHref={href}
          {...props}
        >
          {children}
        </CmsLinkResolved>
      );

    case HrefKind.Slug:
      return (
        <CmsLinkResolved
          slug={parsed.identifier}
          lang={lang}
          type={type}
          locale={locale}
          targetLocale={targetLocale}
          fallbackHref={href}
          {...props}
        >
          {children}
        </CmsLinkResolved>
      );
  }
}

// ─── Internal: resolved link with tRPC query ────────────────────────────────

interface CmsLinkResolvedProps extends Omit<ComponentPropsWithoutRef<'a'>, 'href'> {
  id?: string;
  slug?: string;
  lang?: string;
  type?: string;
  fragment?: string;
  locale: string;
  targetLocale: Locale;
  fallbackHref?: string;
}

function CmsLinkResolved({
  id,
  slug,
  lang,
  type,
  fragment,
  locale,
  targetLocale,
  fallbackHref,
  children,
  ...props
}: CmsLinkResolvedProps) {
  const { data } = trpc.cmsLink.resolve.useQuery(
    { id, slug, lang, type, locale },
    {
      staleTime: 60 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      enabled: !!(id || slug),
    },
  );

  // Append fragment if present
  let resolvedHref = data?.href;
  if (resolvedHref && fragment) {
    resolvedHref = `${resolvedHref}#${fragment}`;
  }

  // Fallback: locale-prefix the original href
  const href =
    resolvedHref ??
    (fallbackHref ? localePath(fallbackHref, targetLocale) : undefined);
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
