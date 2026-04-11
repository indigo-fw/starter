/**
 * CMS Link — shared utilities safe for both server and client bundles.
 *
 * This file has ZERO server dependencies (no DB, no Drizzle, no Redis).
 * The client component (CmsLink.tsx) imports from here, not from cms-link.ts.
 */

import type { ContentTypeDeclaration } from '@/core/config/content-types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CmsLinkRef {
  id?: string;
  slug?: string;
  lang?: string;
  type?: string;
  fragment?: string;
}

export interface ResolvedCmsLink {
  href: string;
  title: string;
  locale: string;
}

// ─── DI Configuration ───────────────────────────────────────────────────────

export interface CmsLinkConfig {
  urlPrefixes: Record<string, string>;
  postTypeMap: Record<number, string>;
  /** Known static route paths — DB lookup is skipped for these. */
  staticRoutes: Set<string>;
  /** Path prefixes that bypass locale-prefixing and DB resolution entirely. */
  passthroughPrefixes: readonly string[];
}

const DEFAULT_PASSTHROUGH_PREFIXES = [
  '/dashboard',
  '/api/',
  'http://',
  'https://',
  'mailto:',
  'tel:',
  '#',
] as const;

let _config: CmsLinkConfig = {
  urlPrefixes: {},
  postTypeMap: {},
  staticRoutes: new Set(),
  passthroughPrefixes: DEFAULT_PASSTHROUGH_PREFIXES,
};

/** Get the current config (used by server resolver). */
export function getCmsLinkConfig(): CmsLinkConfig {
  return _config;
}

/** Register content type URL prefixes, post type mapping, and static routes. */
export function configureCmsLinks(config: CmsLinkConfig): void {
  _config = config;
}

/** Convenience: configure from ContentTypeDeclaration array + optional extras. */
export function configureCmsLinksFromContentTypes(
  types: readonly ContentTypeDeclaration[],
  opts?: {
    staticRoutes?: readonly string[];
    passthroughPrefixes?: readonly string[];
  },
): void {
  configureCmsLinks({
    urlPrefixes: Object.fromEntries(types.map((ct) => [ct.id, ct.urlPrefix])),
    postTypeMap: Object.fromEntries(
      types
        .filter((ct) => ct.postType != null)
        .map((ct) => [ct.postType!, ct.id]),
    ),
    staticRoutes: new Set(opts?.staticRoutes ?? []),
    passthroughPrefixes:
      opts?.passthroughPrefixes ?? DEFAULT_PASSTHROUGH_PREFIXES,
  });
}

/** Check if a path is a known static route (no DB lookup needed). */
export function isStaticRoute(path: string): boolean {
  return _config.staticRoutes.has(path);
}

/** Check if a path should bypass locale-prefixing and DB resolution. */
export function isPassthroughHref(href: string): boolean {
  return _config.passthroughPrefixes.some((p) => href.startsWith(p));
}

// ─── URI Parser ─────────────────────────────────────────────────────────────

/** UUID v4 pattern — used to auto-detect ID vs slug in cms:// URIs and href. */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Regex to detect cms:// URIs in a string. */
export const CMS_URI_RE = /cms:\/\/[^\s)"'<>]+/g;

/**
 * Parse a `cms://` URI into a structured reference.
 * Returns null if the URI is invalid or not a cms:// protocol.
 */
export function parseCmsUri(uri: string): CmsLinkRef | null {
  if (!uri.startsWith('cms://')) return null;

  try {
    const url = new URL(uri);
    const identifier = (url.hostname + url.pathname.replace(/^\/$/, ''))
      .toLowerCase();

    if (!identifier) return null;

    const lang = url.searchParams.get('lang') ?? undefined;
    const type = url.searchParams.get('type') ?? undefined;
    const fragment = url.hash ? url.hash.slice(1) : undefined;
    const isId = UUID_RE.test(identifier);

    return {
      ...(isId ? { id: identifier } : { slug: identifier }),
      lang: lang || undefined,
      type: type || undefined,
      fragment: fragment || undefined,
    };
  } catch {
    return null;
  }
}
