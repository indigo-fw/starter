/**
 * Content sync — imports .md files from content/{locale}/ into CMS database tables.
 *
 * Sync rules:
 *   - New file (no DB entry): INSERT as published
 *   - File newer than DB: save revision, UPDATE
 *   - DB newer than file: SKIP (editor changes preserved)
 *   - Unknown directory prefix: SKIP with warning
 *   - .mdx files: ignored (handled at runtime)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, extname, basename } from 'path';
import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';

import { parseFrontmatter } from '@/core/lib/content/frontmatter';
import { createRevision, pickSnapshot } from '@/core/crud/content-revisions';
import { createLogger } from '@/core/lib/infra/logger';
import { PostType, ContentStatus } from '@/core/types/cms';
import { cmsPosts } from '@/server/db/schema/cms';
import type { DbClient } from '@/server/db';

const logger = createLogger('content-sync');


// ─── Types ──────────────────────────────────────────────────────────────────

interface MdFrontmatter {
  title?: string;
  description?: string;
  seoTitle?: string;
  date?: string;
  image?: string;
  imageAlt?: string;
  noindex?: boolean;
}

interface FileEntry {
  slug: string;
  locale: string;
  postType: number;
  contentTypeId: string;
  frontmatter: MdFrontmatter;
  content: string;
  filePath: string;
  mtime: Date;
}

/** Fields to snapshot when creating a revision before update. */
const SNAPSHOT_KEYS = [
  'title', 'slug', 'content', 'status', 'metaDescription', 'seoTitle',
  'featuredImage', 'featuredImageAlt', 'noindex', 'publishedAt', 'lang',
] as const;

// ─── Build mapping from config ──────────────────────────────────────────────

interface ContentTypeEntry {
  id: string;
  listSegment?: string;
  postType?: number;
}

/**
 * Build directory→postType mapping from the CMS content types config.
 * Only includes content types backed by cms_posts (those with a postType).
 */
function buildDirMapping(contentTypes: readonly ContentTypeEntry[]): {
  dirToPostType: Record<string, number>;
  dirToContentType: Record<string, string>;
  validDirs: Set<string>;
} {
  const dirToPostType: Record<string, number> = {};
  const dirToContentType: Record<string, string> = {};

  for (const ct of contentTypes) {
    if (ct.postType == null || !ct.listSegment) continue;
    if (ct.id === 'page') continue; // pages are root-level, no directory prefix
    dirToPostType[ct.listSegment] = ct.postType;
    dirToContentType[ct.listSegment] = ct.id;
  }

  return {
    dirToPostType,
    dirToContentType,
    validDirs: new Set(Object.keys(dirToPostType)),
  };
}

// ─── Scanner ────────────────────────────────────────────────────────────────

const CONTENT_DIR = join(process.cwd(), 'content');

function scanMdFiles(
  dirToPostType: Record<string, number>,
  dirToContentType: Record<string, string>,
  validDirs: Set<string>,
  allowedLocales?: ReadonlySet<string>,
): FileEntry[] {
  if (!existsSync(CONTENT_DIR)) return [];

  const entries: FileEntry[] = [];

  for (const localeDir of readdirSync(CONTENT_DIR)) {
    const localePath = join(CONTENT_DIR, localeDir);
    if (!statSync(localePath).isDirectory()) continue;
    if (allowedLocales && !allowedLocales.has(localeDir)) continue;
    scanDir(localePath, localePath, localeDir, entries, dirToPostType, dirToContentType, validDirs);
  }

  return entries;
}

function scanDir(
  dir: string,
  baseDir: string,
  locale: string,
  entries: FileEntry[],
  dirToPostType: Record<string, number>,
  dirToContentType: Record<string, string>,
  validDirs: Set<string>,
) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      scanDir(fullPath, baseDir, locale, entries, dirToPostType, dirToContentType, validDirs);
      continue;
    }

    if (extname(entry).toLowerCase() !== '.md') continue;
    // Skip documentation/meta files (ALL-CAPS names like CLAUDE.md, README.md, LICENSE.md, etc.)
    if (/^[A-Z][A-Z0-9_-]*\.md$/.test(entry)) continue;

    const raw = readFileSync(fullPath, 'utf-8');
    const { frontmatter, content } = parseFrontmatter<MdFrontmatter>(raw);

    const relPath = relative(baseDir, fullPath)
      .replace(/\\/g, '/')
      .replace(/\.md$/, '')
      .replace(/\/index$/, '');

    const firstSegment = relPath.includes('/') ? relPath.split('/')[0] : null;

    if (firstSegment && !validDirs.has(firstSegment)) {
      logger.warn(`Skipping ${locale}/${relPath}.md — directory "${firstSegment}/" is not a syncable content type`);
      continue;
    }

    const postType = firstSegment ? dirToPostType[firstSegment]! : PostType.PAGE;
    const contentTypeId = firstSegment ? dirToContentType[firstSegment]! : 'page';
    const slug = postType !== PostType.PAGE && firstSegment
      ? relPath.split('/').slice(1).join('/')
      : relPath;

    entries.push({
      slug,
      locale,
      postType,
      contentTypeId,
      frontmatter: {
        ...frontmatter,
        title: frontmatter.title ?? basename(slug).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      },
      content,
      filePath: `${locale}/${relPath}.md`,
      mtime: stat.mtime,
    });
  }
}

// ─── Sync ───────────────────────────────────────────────────────────────────

export interface SyncOptions {
  dryRun?: boolean;
  /** Content type declarations from cms.ts config */
  contentTypes: readonly ContentTypeEntry[];
  /** Only sync these locales. If omitted, syncs all locale dirs found in content/. */
  locales?: readonly string[];
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
}

/**
 * Sync .md content files to the CMS database.
 * Called at server startup and available as a CLI command.
 */
export async function syncContentFiles(db: DbClient, opts: SyncOptions): Promise<SyncResult> {
  const { dryRun, contentTypes, locales } = opts;
  const { dirToPostType, dirToContentType, validDirs } = buildDirMapping(contentTypes);
  const allowedLocales = locales ? new Set(locales) : undefined;

  const files = scanMdFiles(dirToPostType, dirToContentType, validDirs, allowedLocales);
  if (files.length === 0) {
    logger.info('No .md files found in content/');
    return { created: 0, updated: 0, skipped: 0 };
  }

  logger.info(`Found ${files.length} .md file(s) to sync${dryRun ? ' (dry run)' : ''}`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const { slug, locale, postType, contentTypeId, frontmatter, filePath, mtime } = file;

    // Store raw content with [[VAR]] placeholders — resolved at render time by resolveContentVars
    const title = frontmatter.title!;
    const content = file.content;
    const description = frontmatter.description ?? null;
    const seoTitle = frontmatter.seoTitle ?? null;

    const [existing] = await db
      .select()
      .from(cmsPosts)
      .where(
        and(
          eq(cmsPosts.slug, slug),
          eq(cmsPosts.type, postType),
          eq(cmsPosts.lang, locale),
        )
      )
      .limit(1);

    if (!existing) {
      logger.info(`CREATE ${filePath} → ${contentTypeId}/${locale}/${slug}`);
      if (!dryRun) {
        await db.insert(cmsPosts).values({
          type: postType,
          status: ContentStatus.PUBLISHED,
          lang: locale,
          slug,
          title,
          content,
          metaDescription: description,
          seoTitle,
          featuredImage: frontmatter.image ?? null,
          featuredImageAlt: frontmatter.imageAlt ?? null,
          noindex: frontmatter.noindex ?? false,
          publishedAt: frontmatter.date ? new Date(frontmatter.date) : new Date(),
          previewToken: crypto.randomBytes(32).toString('hex'),
        });
      }
      created++;
      continue;
    }

    // DB is newer or same — editor changes are preserved
    if (existing.updatedAt >= mtime) {
      skipped++;
      continue;
    }

    logger.info(`UPDATE ${filePath} → ${contentTypeId}/${locale}/${slug}`);
    if (!dryRun) {
      const snapshot = pickSnapshot(existing, [...SNAPSHOT_KEYS]);
      await createRevision(db, contentTypeId, existing.id, snapshot);

      await db
        .update(cmsPosts)
        .set({
          title,
          content,
          metaDescription: description ?? existing.metaDescription,
          seoTitle: seoTitle ?? existing.seoTitle,
          featuredImage: frontmatter.image ?? existing.featuredImage,
          featuredImageAlt: frontmatter.imageAlt ?? existing.featuredImageAlt,
          noindex: frontmatter.noindex ?? existing.noindex,
          publishedAt: frontmatter.date ? new Date(frontmatter.date) : existing.publishedAt,
          updatedAt: new Date(),
        })
        .where(eq(cmsPosts.id, existing.id));
    }
    updated++;
  }

  logger.info(`Content sync done: ${created} created, ${updated} updated, ${skipped} skipped`);
  return { created, updated, skipped };
}
