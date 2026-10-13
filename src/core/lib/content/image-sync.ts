/**
 * Content image sync — uploads co-located `content/**` images to storage/CDN.
 *
 * Companion to `syncContentFiles` (./sync.ts). Where that imports `.md` text
 * into `cms_posts`, this handles the images those files reference via
 * `cms://asset/<path>` URIs, so authors can commit an image next to its `.md`
 * and have it served from storage (S3/CDN in prod) without a manual upload.
 *
 * Model: path + content-hash, mutable in place.
 *   - A referenced asset is keyed by its content-root-relative `sourcePath`
 *     (e.g. "en/create-ai-girlfriend-cover.webp").
 *   - Its md5 (32-char hex → `sourceHash`) drives change detection AND the
 *     cache-busting storage key (`content-media/<path>.<hash8>.<ext>`), so an
 *     edited image gets a brand-new immutable URL — no CDN purge needed.
 *   - Unchanged hash → skip (idempotent; safe to re-run every deploy). Changed
 *     hash → upload new key, insert a fresh active row, tombstone the old row
 *     with `deletedAt` (the orphan pruner removes its object 30 days later —
 *     see src/scripts/prune-orphaned-media.ts).
 *   - A referenced file missing on disk is warned + skipped, never deleted:
 *     removing the source keeps the live site working (object + row persist).
 *
 * Concurrency: the `cms_post_attachments_source_path_active_uniq` partial unique
 * index (one active row per sourcePath) makes concurrent instance boots safe —
 * a racing insert hits a 23505 unique violation and is skipped. No advisory
 * lock needed (Postgres does what MySQL couldn't).
 *
 * @see ./asset-link.ts for the render-time resolver.
 */

import crypto from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, extname, join, resolve, sep } from 'path';

import { isDuplicateKeyError } from '@/core/crud/drizzle-utils';
import { createLogger } from '@/core/lib/infra/logger';
import { getStorage } from '@/core/storage';
import { FileType } from '@/core/types/cms';
import type { DbClient } from '@/server/db';
import { cmsPostAttachments } from '@/server/db/schema/cms';

const logger = createLogger('content-image-sync');

const CONTENT_DIR = join(process.cwd(), 'content');

/** Storage key prefix for synced content images (namespaced under uploads/). */
const CDN_PREFIX = 'content-media';

/** Matches `cms://asset/<source-path>` in .md frontmatter + body. */
const ASSET_URI_RE = /cms:\/\/asset\/([^\s)"'<>?#]+)/g;

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

/**
 * True if the file is an unresolved git-LFS pointer (checkout without
 * `git lfs pull`), not the real image. Pointer files are small UTF-8 text
 * beginning with the LFS spec version line. Uploading one to the CDN would
 * serve a ~130-byte text file as a broken image — skip it instead. (Matches
 * the flirtcam content-image-sync backstop + the repo's LFS deploy contract.)
 */
function isLfsPointer(buf: Buffer): boolean {
  if (buf.length > 300) return false;
  return buf
    .toString('utf8', 0, 45)
    .startsWith('version https://git-lfs.github.com/spec/v1');
}

/** Postgres unique_violation — the partial unique index caught a concurrent insert. */
function isUniqueViolation(err: unknown): boolean {
  return isDuplicateKeyError(err);
}

export interface ImageSyncResult {
  uploaded: number;
  updated: number;
  skipped: number;
  missing: number;
  /** Concurrent instance won the insert race (partial-unique 23505). */
  raced: number;
  /** Referenced file was an unresolved git-LFS pointer, not the real image. */
  pointers: number;
}

// ─── Scanner ────────────────────────────────────────────────────────────────

/** Recursively collect every `sourcePath` referenced by a `cms://asset/` URI. */
function collectReferencedAssets(): Set<string> {
  const found = new Set<string>();
  if (!existsSync(CONTENT_DIR)) return found;

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (extname(entry).toLowerCase() !== '.md') continue;
      // Skip ALL-CAPS docs (AGENTS.md, CLAUDE.md, README.md…) — mirrors content sync.
      if (/^[A-Z][A-Z0-9_-]*\.md$/.test(entry)) continue;

      const raw = readFileSync(full, 'utf-8');
      for (const m of raw.matchAll(ASSET_URI_RE)) {
        const sp = m[1];
        // Reject traversal / absolute paths — sourcePath stays under content/.
        if (sp.includes('..') || sp.startsWith('/')) {
          logger.warn(`Ignoring unsafe asset path: ${sp}`);
          continue;
        }
        found.add(sp);
      }
    }
  };

  walk(CONTENT_DIR);
  return found;
}

/** Resolve a sourcePath to its on-disk file, guarding against escaping content/. */
function safeContentPath(sourcePath: string): string | null {
  const abs = resolve(CONTENT_DIR, sourcePath);
  if (abs !== CONTENT_DIR && !abs.startsWith(CONTENT_DIR + sep)) return null;
  return abs;
}

// ─── Sync ─────────────────────────────────────────────────────────────────--

/**
 * Upload/refresh every `cms://asset/`-referenced image to storage and keep
 * `cms_post_attachments` in sync. Idempotent — safe to run on every deploy.
 */
export async function syncContentImages(
  db: DbClient,
  opts: { dryRun?: boolean } = {},
): Promise<ImageSyncResult> {
  const { dryRun } = opts;
  const referenced = collectReferencedAssets();
  const result: ImageSyncResult = {
    uploaded: 0,
    updated: 0,
    skipped: 0,
    missing: 0,
    raced: 0,
    pointers: 0,
  };

  if (referenced.size === 0) {
    logger.info('No cms://asset/ references found in content/');
    return result;
  }

  logger.info(
    `Found ${referenced.size} referenced content image(s)${dryRun ? ' (dry run)' : ''}`,
  );

  const storage = getStorage();

  for (const sourcePath of referenced) {
    const diskPath = safeContentPath(sourcePath);
    if (!diskPath || !existsSync(diskPath)) {
      logger.warn(
        `Referenced image missing on disk — skipping (live copy preserved): ${sourcePath}`,
      );
      result.missing++;
      continue;
    }

    const buf = readFileSync(diskPath);
    if (isLfsPointer(buf)) {
      logger.warn(
        `Referenced image is an unresolved git-LFS pointer (run \`git lfs pull\`) — skipping: ${sourcePath}`,
      );
      result.pointers++;
      continue;
    }
    const hash = crypto.createHash('md5').update(buf).digest('hex'); // 32-char hex

    // Current active (non-superseded) row for this sourcePath, if any.
    const [active] = await db
      .select({
        id: cmsPostAttachments.id,
        sourceHash: cmsPostAttachments.sourceHash,
      })
      .from(cmsPostAttachments)
      .where(
        and(
          eq(cmsPostAttachments.sourcePath, sourcePath),
          isNull(cmsPostAttachments.deletedAt),
        ),
      )
      .limit(1);

    if (active?.sourceHash === hash) {
      result.skipped++;
      continue;
    }

    const ext = extname(sourcePath).toLowerCase();
    const mimeType = MIME_BY_EXT[ext] ?? 'application/octet-stream';
    const hash8 = hash.slice(0, 8);
    // Cache-busting immutable key: same path, new hash → new URL.
    const cdnKey = `${CDN_PREFIX}/${sourcePath.slice(0, sourcePath.length - ext.length)}.${hash8}${ext}`;

    logger.info(
      `${active ? 'UPDATE' : 'UPLOAD'} ${sourcePath} → ${cdnKey}${dryRun ? ' (dry run)' : ''}`,
    );

    if (dryRun) {
      if (active) result.updated++;
      else result.uploaded++;
      continue;
    }

    await storage.upload(cdnKey, buf);

    // Tombstone the superseded row FIRST (removes it from the partial unique
    // index) so the new active row can be inserted. The pruner GCs its object
    // after the grace window.
    if (active) {
      await db
        .update(cmsPostAttachments)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(cmsPostAttachments.id, active.id),
            isNull(cmsPostAttachments.deletedAt),
          ),
        );
    }

    try {
      await db.insert(cmsPostAttachments).values({
        filename: basename(sourcePath),
        filepath: cdnKey,
        fileType: FileType.IMAGE,
        mimeType,
        fileSize: buf.length,
        sourcePath,
        sourceHash: hash,
      });
      if (active) result.updated++;
      else result.uploaded++;
    } catch (err) {
      // A concurrent instance inserted the active row first (partial unique).
      // The object is already uploaded and the row exists → nothing more to do.
      if (isUniqueViolation(err)) {
        logger.info(`Raced by another instance — skipping: ${sourcePath}`);
        result.raced++;
      } else {
        throw err;
      }
    }
  }

  logger.info(
    `Content image sync: ${result.uploaded} uploaded, ${result.updated} updated, ${result.skipped} unchanged, ${result.missing} missing, ${result.raced} raced, ${result.pointers} lfs-pointer`,
  );
  return result;
}
