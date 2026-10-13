/**
 * `cms://asset/<path>` render-time resolver (server-only).
 *
 * Turns the `cms://asset/` URIs authored in `.md` content into the live
 * storage/CDN URL of the currently-active `cms_post_attachments` row for that
 * `sourcePath`. Resolution happens at render (not sync) time on purpose: it
 * always reflects the current active row, so an image edited in place — which
 * bumps the hash and inserts a new active row without touching the `.md` — is
 * picked up without re-syncing the post.
 *
 * Wired into the data layer (`src/app/(public)/[...slug]/data.ts`) alongside
 * `resolveRecordCmsLinks`, so it covers every content type's detail render,
 * OpenGraph metadata, and list cards in one place. Runs BEFORE the cms-link
 * resolver so `cms://asset/` URIs are turned into URLs before the link resolver
 * (which would otherwise treat them as unresolvable slugs) ever sees them.
 *
 * @see ./image-sync.ts for the upload side.
 */

import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';

import { getStorage } from '@/core/storage';
import { db } from '@/server/db';
import { cmsPostAttachments } from '@/server/db/schema/cms';

/** Matches `cms://asset/<source-path>` (path ends at whitespace/quote/paren). */
const ASSET_URI_RE = /cms:\/\/asset\/([^\s)"'<>?#]+)/g;

/** Resolve a sourcePath's active attachment to its public storage/CDN URL. */
async function lookupAssetUrl(sourcePath: string): Promise<string | null> {
  const [row] = await db
    .select({ filepath: cmsPostAttachments.filepath })
    .from(cmsPostAttachments)
    .where(
      and(
        eq(cmsPostAttachments.sourcePath, sourcePath),
        isNull(cmsPostAttachments.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  return getStorage().url(row.filepath);
}

/** Resolve every `cms://asset/` URI in a text blob to its storage/CDN URL. */
export async function resolveAssetUris(text: string): Promise<string> {
  if (!text || !text.includes('cms://asset/')) return text;

  const uriToPath = new Map<string, string>();
  for (const m of text.matchAll(ASSET_URI_RE)) {
    if (!uriToPath.has(m[0])) uriToPath.set(m[0], m[1]);
  }
  if (uriToPath.size === 0) return text;

  const replacements = new Map<string, string>();
  await Promise.all(
    [...uriToPath.entries()].map(async ([uri, sourcePath]) => {
      const url = await lookupAssetUrl(sourcePath);
      if (url) replacements.set(uri, url);
    }),
  );

  let out = text;
  for (const [uri, url] of replacements) out = out.replaceAll(uri, url);
  return out;
}

/**
 * Resolve `cms://asset/` URIs in all string fields of a record (shallow).
 * Mirrors `resolveRecordCmsLinks`; returns a new object, non-strings pass through.
 */
export async function resolveRecordAssetUris<T extends Record<string, unknown>>(
  record: T,
): Promise<T> {
  let hasAsset = false;
  for (const val of Object.values(record)) {
    if (typeof val === 'string' && val.includes('cms://asset/')) {
      hasAsset = true;
      break;
    }
  }
  if (!hasAsset) return record;

  const resolved = { ...record };
  for (const [key, val] of Object.entries(resolved)) {
    if (typeof val === 'string' && val.includes('cms://asset/')) {
      (resolved as Record<string, unknown>)[key] = await resolveAssetUris(val);
    }
  }
  return resolved;
}
