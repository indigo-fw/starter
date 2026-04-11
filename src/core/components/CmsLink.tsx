'use client';

import { type ComponentPropsWithoutRef } from 'react';
import NextLink from 'next/link';
import { useLocale } from 'next-intl';
import { trpc } from '@/lib/trpc/client';
import { localePath } from '@/core/lib/i18n/locale';
import {
  isStaticRoute,
  isPassthroughHref,
  parseCmsUri,
  UUID_RE,
} from '@/core/lib/content/cms-link';
import type { Locale } from '@/lib/constants';

/** What kind of href was detected. */
const HrefKind = {
  /** Known static route — no DB call, just locale prefix. */
  Static: 'static',
  /** UUID detected after slash — resolve by ID. */
  Id: 'id',
  /** cms:// protocol — parse and resolve. */
  CmsProtocol: 'cms',
  /** Unknown path — try slug lookup, fallback to literal. */
  Slug: 'slug',
  /** External or non-locale path (/dashboard, /api, http://) — pass through as-is. */
  Passthrough: 'passthrough',
} as const;

type HrefKindValue = (typeof HrefKind)[keyof typeof HrefKind];

interface ParsedHref {
  kind: HrefKindValue;
  /** Path without fragment or query — used for static route matching and slug lookup. */
  path: string;
  /** Extracted identifier (UUID or slug) — without leading slash. */
  identifier?: string;
  /** Fragment (#...) stripped from original href — reattached after resolution. */
  fragment?: string;
  /** Query string (?...) stripped from original href — reattached after resolution. */
  query?: string;
}

/**
 * Split a path into its base, query string, and fragment.
 * "/about-us?ref=nav#team" → { path: "/about-us", query: "?ref=nav", fragment: "#team" }
 */
function splitHref(href: string): {
  path: string;
  query?: string;
  fragment?: string;
} {
  let path = href;
  let fragment: string | undefined;
  let query: string | undefined;

  // Extract fragment first (it can contain ?)
  const hashIdx = path.indexOf('#');
  if (hashIdx !== -1) {
    fragment = path.slice(hashIdx);
    path = path.slice(0, hashIdx);
  }

  // Extract query string
  const qIdx = path.indexOf('?');
  if (qIdx !== -1) {
    query = path.slice(qIdx);
    path = path.slice(0, qIdx);
  }

  return { path, query, fragment };
}

function classifyHref(href: string): ParsedHref {
  // Passthrough: external, dashboard, API, anchors, tel, mailto
  if (isPassthroughHref(href)) {
    return { kind: HrefKind.Passthrough, path: href };
  }

  // cms:// protocol — parsed separately, has its own fragment/query handling
  if (href.startsWith('cms://')) {
    return { kind: HrefKind.CmsProtocol, path: href };
  }

  // Split off fragment and query before classification
  const { path, query, fragment } = splitHref(href);

  // Known static route — exact match against registered pathnames
  if (isStaticRoute(path)) {
    return { kind: HrefKind.Static, path, query, fragment };
  }

  // Extract the identifier after the leading slash
  const identifier = path.replace(/^\//, '');

  // UUID detection
  if (UUID_RE.test(identifier)) {
    return { kind: HrefKind.Id, path, identifier, query, fragment };
  }

  // Everything else — treat as slug
  return { kind: HrefKind.Slug, path, identifier, query, fragment };
}

/** Reattach query and fragment to a resolved URL. */
function reattach(
  url: string,
  query?: string,
  fragment?: string,
): string {
  if (query) url += query;
  if (fragment) url += fragment;
  return url;
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
  href?: TPath | `/${string}` | `cms://${string}` | (string & {});
  /** Explicit content UUID — skips auto-detection, goes straight to ID lookup. */
  id?: string;
  /** Explicit content slug — skips auto-detection, goes straight to slug lookup. */
  slug?: string;
  /** Target locale override. Default: visitor's current locale. */
  lang?: string;
  /** Content type hint for slug disambiguation (page, blog, category, etc.). */
  type?: string;
}

export type CmsLinkProps<TPath extends string = string> =
  CmsLinkBaseProps<TPath>;

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
 * Fragments (#...) and query strings (?...) are preserved through resolution.
 *
 * @example
 * // Static routes — typed, instant, no DB call
 * <Link href="/blog">Blog</Link>
 * <Link href="/pricing">Pricing</Link>
 *
 * // CMS content — auto-detected, resolved from DB
 * <Link href="/about-us">About Us</Link>
 * <Link href="/about-us#team">Team section</Link>
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
    // Strip fragment/query from href for fallback
    const fallback = href ? splitHref(href) : undefined;
    return (
      <CmsLinkResolved
        id={id}
        slug={slug}
        lang={lang}
        type={type}
        locale={locale}
        targetLocale={targetLocale}
        fallbackPath={fallback?.path}
        query={fallback?.query}
        fragment={fallback?.fragment}
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
        <NextLink
          href={reattach(localePath(parsed.path, targetLocale), parsed.query, parsed.fragment)}
          {...props}
        >
          {children}
        </NextLink>
      );

    case HrefKind.CmsProtocol: {
      const ref = parseCmsUri(href);
      if (!ref) {
        // Malformed cms:// URI — render as plain text
        return <span {...props}>{children}</span>;
      }
      return (
        <CmsLinkResolved
          id={ref.id}
          slug={ref.slug}
          lang={ref.lang ?? lang}
          type={ref.type ?? type}
          fragment={ref.fragment ? `#${ref.fragment}` : undefined}
          locale={locale}
          targetLocale={targetLocale}
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
          fallbackPath={parsed.path}
          query={parsed.query}
          fragment={parsed.fragment}
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
          fallbackPath={parsed.path}
          query={parsed.query}
          fragment={parsed.fragment}
          {...props}
        >
          {children}
        </CmsLinkResolved>
      );
  }
}

// ─── Internal: resolved link with tRPC query ────────────────────────────────

interface CmsLinkResolvedProps
  extends Omit<ComponentPropsWithoutRef<'a'>, 'href'> {
  id?: string;
  slug?: string;
  lang?: string;
  type?: string;
  /** Fragment to append — already includes '#' prefix. */
  fragment?: string;
  /** Query string to append — already includes '?' prefix. */
  query?: string;
  locale: string;
  targetLocale: Locale;
  /** Fallback path (without query/fragment) to use if resolution fails. */
  fallbackPath?: string;
}

function CmsLinkResolved({
  id,
  slug,
  lang,
  type,
  fragment,
  query,
  locale,
  targetLocale,
  fallbackPath,
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

  // Build final href: resolved URL (or fallback) + reattach query/fragment
  let href: string | undefined;

  if (data?.href) {
    // Resolved from DB — query/fragment are reattached
    href = reattach(data.href, query, fragment);
  } else if (fallbackPath) {
    // Resolution failed or pending — use fallback with locale prefix
    href = reattach(localePath(fallbackPath, targetLocale), query, fragment);
  }

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
