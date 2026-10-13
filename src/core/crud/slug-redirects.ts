import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { DbClient } from '@/server/db';
import { db as defaultDb } from '@/server/db';
import { cmsSlugRedirects } from '@/server/db/schema';

// ---------------------------------------------------------------------------
// Slug resolver registry — contentType → how to look up the current slug
// ---------------------------------------------------------------------------

/** Resolves a redirect target's current slug; null when the target is gone (or trashed). */
export type SlugResolver = (
  db: DbClient,
  contentId: string
) => Promise<string | null>;

const slugResolvers = new Map<string, SlugResolver>();

/** What the admin redirects list shows for a target: its current slug + a display title. */
export interface RedirectTarget {
  slug: string;
  title: string;
}

/**
 * Batch lookup of redirect targets for one `contentType` — the admin list
 * resolves a whole page per type in one query instead of one per row.
 */
export type RedirectTargetResolver = (
  db: DbClient,
  contentIds: string[]
) => Promise<Map<string, RedirectTarget>>;

const targetResolvers = new Map<string, RedirectTargetResolver>();

/**
 * Register how a redirect `contentType` resolves to its current slug. Each
 * router that writes `cms_slug_redirects` rows registers the type(s) it writes
 * at module load (post-backed types, category, portfolio, showcase, …) — core
 * cannot enumerate them without importing project config, and a hardcoded
 * category/post branch silently 404s every other type's old URLs.
 *
 * The optional `targetResolver` feeds the admin redirects list (title + slug);
 * without it that list shows the type's rows as "(deleted)".
 */
export function registerSlugResolver(
  contentTypeId: string,
  resolver: SlugResolver,
  targetResolver?: RedirectTargetResolver
): void {
  slugResolvers.set(contentTypeId, resolver);
  if (targetResolver) targetResolvers.set(contentTypeId, targetResolver);
}

/** Build a resolver for a soft-deletable table keyed by `id` with a `slug` column. */
export function createTableSlugResolver(cols: {
  table: PgTable;
  id: PgColumn;
  slug: PgColumn;
  deletedAt: PgColumn;
}): SlugResolver {
  return async (db, contentId) => {
    const [row] = await db
      .select({ slug: cols.slug })
      .from(cols.table)
      .where(and(eq(cols.id, contentId), isNull(cols.deletedAt)))
      .limit(1);
    const slug = (row as { slug?: unknown } | undefined)?.slug;
    return typeof slug === 'string' && slug.length > 0 ? slug : null;
  };
}

/**
 * Build a batch target resolver for a table keyed by `id` with `slug` + `title`
 * columns. Deliberately no `deletedAt` filter: the admin list should still name
 * a trashed target (it can be restored); "(deleted)" is for hard-deleted rows.
 */
export function createTableTargetResolver(cols: {
  table: PgTable;
  id: PgColumn;
  slug: PgColumn;
  title: PgColumn;
}): RedirectTargetResolver {
  return async (db, contentIds) => {
    const out = new Map<string, RedirectTarget>();
    if (contentIds.length === 0) return out;
    const rows = await db
      .select({ id: cols.id, slug: cols.slug, title: cols.title })
      .from(cols.table)
      .where(inArray(cols.id, contentIds))
      .limit(contentIds.length);
    for (const raw of rows) {
      const row = raw as { id?: unknown; slug?: unknown; title?: unknown };
      if (typeof row.id !== 'string') continue;
      out.set(row.id, {
        slug: typeof row.slug === 'string' ? row.slug : '',
        title: typeof row.title === 'string' ? row.title : '',
      });
    }
    return out;
  };
}

/**
 * Batch-resolve redirect targets of one `contentType`. Empty map when the type
 * has no registered target resolver — callers render those rows as missing.
 */
export async function resolveRedirectTargets(
  db: DbClient,
  contentType: string,
  contentIds: string[]
): Promise<Map<string, RedirectTarget>> {
  const resolver = targetResolvers.get(contentType);
  if (!resolver || contentIds.length === 0) return new Map();
  return resolver(db, contentIds);
}

/**
 * Current slug of a redirect target, or null when the type has no registered
 * resolver or the target no longer exists.
 */
export async function resolveCurrentSlug(
  db: DbClient,
  contentType: string,
  contentId: string
): Promise<string | null> {
  const resolver = slugResolvers.get(contentType);
  if (!resolver) return null;
  return resolver(db, contentId);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up a slug redirect and resolve to the content's current slug.
 * Returns the full path (urlPrefix + currentSlug) if found, null otherwise.
 *
 * Stores content_id so A→B→C all resolve to the current slug — no chain-following.
 */
export async function resolveSlugRedirect(
  slug: string,
  urlPrefix: string
): Promise<string | null> {
  const redirect = await defaultDb.query.cmsSlugRedirects.findFirst({
    where: and(
      eq(cmsSlugRedirects.oldSlug, slug),
      eq(cmsSlugRedirects.urlPrefix, urlPrefix)
    ),
    orderBy: desc(cmsSlugRedirects.createdAt),
    columns: {
      contentType: true,
      contentId: true,
    },
  });

  if (!redirect) return null;

  const currentSlug = await resolveCurrentSlug(
    defaultDb,
    redirect.contentType,
    redirect.contentId
  );
  if (!currentSlug || currentSlug === slug) return null;

  return `${urlPrefix}${currentSlug}`;
}
