import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, extname, basename } from 'path';
import { createLogger } from '@/core/lib/logger';
import { parseFrontmatter } from '@/core/lib/frontmatter';

const logger = createLogger('content-loader');

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ContentFrontmatter {
  title?: string;
  /** Content type: 'page' | 'post' | 'portfolio' | 'showcase' etc. Defaults to 'page'. */
  type?: string;
  description?: string;
  /** Category slug (for blog posts) */
  category?: string;
  /** Tag slugs (for blog posts) */
  tags?: string[];
  /** Publish date (ISO or YYYY-MM-DD) */
  date?: string;
  /** Featured image URL */
  image?: string;
  /** Featured image alt text */
  imageAlt?: string;
  /** SEO title override */
  seoTitle?: string;
  /** noindex flag */
  noindex?: boolean;
  /** Sort order for pages */
  order?: number;
  /** Hide from listings */
  hidden?: boolean;
}

export interface FileContent {
  /** URL slug derived from file path (e.g. 'blog/my-post') */
  slug: string;
  /** Parsed frontmatter */
  frontmatter: ContentFrontmatter;
  /** Raw MDX content without frontmatter */
  content: string;
  /** Locale (directory name) */
  locale: string;
  /** File path relative to content root */
  filePath: string;
  /** Last modified timestamp */
  updatedAt: Date;
}

function titleFromFilename(filename: string): string {
  return basename(filename, extname(filename))
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Directory Scanner ──────────────────────────────────────────────────────

function loadDir(dir: string, baseDir: string, locale: string): FileContent[] {
  if (!existsSync(dir)) return [];

  const items: FileContent[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      items.push(...loadDir(fullPath, baseDir, locale));
      continue;
    }

    if (extname(entry).toLowerCase() !== '.mdx') continue;
    // Skip documentation/meta files (ALL-CAPS names like CLAUDE.mdx, README.mdx, etc.)
    if (/^[A-Z][A-Z0-9_-]*\.mdx$/.test(entry)) continue;

    try {
      const raw = readFileSync(fullPath, 'utf-8');
      const { frontmatter, content } = parseFrontmatter<ContentFrontmatter>(raw);

      const relPath = relative(baseDir, fullPath);
      const slug = relPath
        .replace(/\\/g, '/')
        .replace(/\.mdx$/, '')
        .replace(/\/index$/, '');

      items.push({
        slug,
        frontmatter: {
          ...frontmatter,
          title: frontmatter.title ?? titleFromFilename(entry),
        },
        content,
        locale,
        filePath: relPath.replace(/\\/g, '/'),
        updatedAt: stat.mtime,
      });
    } catch (err) {
      logger.error('Failed to load content file', { path: fullPath, error: String(err) });
    }
  }

  return items;
}

// ─── Cache + Public API ─────────────────────────────────────────────────────

const CONTENT_DIR = join(process.cwd(), 'content');
const CACHE_TTL = process.env.NODE_ENV === 'production' ? 5 * 60 * 1000 : 30 * 1000;
let _cache: { items: FileContent[]; ts: number } | null = null;

/**
 * Load all file-based content across all locales.
 * Scans content/{locale}/ directories for .mdx files.
 */
export function loadAllFileContent(): FileContent[] {
  const now = Date.now();
  if (_cache && now - _cache.ts < CACHE_TTL) return _cache.items;

  if (!existsSync(CONTENT_DIR)) {
    _cache = { items: [], ts: now };
    return [];
  }

  const items: FileContent[] = [];

  // Each subdirectory of content/ is a locale
  for (const localeDir of readdirSync(CONTENT_DIR)) {
    const localePath = join(CONTENT_DIR, localeDir);
    if (!statSync(localePath).isDirectory()) continue;
    items.push(...loadDir(localePath, localePath, localeDir));
  }

  _cache = { items, ts: now };
  return items;
}

/**
 * Find a file-based content item by slug and locale.
 * Falls back to the default locale if no locale-specific file exists.
 * Returns null if not found in either (CMS should be queried as fallback).
 */
export function findFileContent(slug: string, locale: string, defaultLocale = 'en'): FileContent | null {
  const items = loadAllFileContent();

  // Try exact locale first
  const exact = items.find((item) => item.slug === slug && item.locale === locale);
  if (exact) return exact;

  // Fall back to default locale
  if (locale !== defaultLocale) {
    return items.find((item) => item.slug === slug && item.locale === defaultLocale) ?? null;
  }

  return null;
}

/**
 * Get a Set of slugs that have .mdx file overrides for a given locale.
 * Used by admin endpoints to show "managed by .mdx" indicators.
 * Returns slugs in the format used by the content type (e.g. 'about', 'blog/my-post').
 */
export function getMdxManagedSlugs(locale: string): Set<string> {
  const items = loadAllFileContent();
  return new Set(items.filter((i) => i.locale === locale).map((i) => i.slug));
}

/** Clear the content cache. */
export function invalidateContentCache(): void {
  _cache = null;
}
