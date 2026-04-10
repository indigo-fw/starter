import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, extname, basename } from 'path';
import { createLogger } from '@/core/lib/infra/logger';
import { parseFrontmatter } from '@/core/lib/content/frontmatter';

const logger = createLogger('docs-loader');

export interface DocFrontmatter {
  title?: string;
  section?: string;
  order?: number;
  description?: string;
  /** Hide from navigation */
  hidden?: boolean;
  /** Version tag (e.g. 'v1', 'v2') */
  version?: string;
}

export interface FileDoc {
  /** URL slug derived from file path (e.g. 'getting-started/installation') */
  slug: string;
  /** Parsed frontmatter */
  frontmatter: DocFrontmatter;
  /** Raw content (markdown or MDX) without frontmatter */
  content: string;
  /** File format */
  format: 'mdx';
  /** File path relative to docs root */
  filePath: string;
  /** Last modified timestamp */
  updatedAt: Date;
}

/**
 * Derive a human-readable title from a filename.
 * 'getting-started.mdx' → 'Getting Started'
 */
function titleFromFilename(filename: string): string {
  return basename(filename, extname(filename))
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Recursively load all .mdx files from a directory.
 */
function loadDir(dir: string, baseDir: string): FileDoc[] {
  if (!existsSync(dir)) return [];

  const docs: FileDoc[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      docs.push(...loadDir(fullPath, baseDir));
      continue;
    }

    const ext = extname(entry).toLowerCase();
    if (ext !== '.mdx') continue;
    // Skip documentation/meta files (ALL-CAPS names like CLAUDE.mdx, README.mdx, etc.)
    if (/^[A-Z][A-Z0-9_-]*\.mdx$/.test(entry)) continue;

    try {
      const raw = readFileSync(fullPath, 'utf-8');
      const { frontmatter, content } = parseFrontmatter<DocFrontmatter>(raw);

      // Build slug from relative path (strip extension)
      const relPath = relative(baseDir, fullPath);
      let slug = relPath
        .replace(/\\/g, '/')
        .replace(/\.mdx$/, '')
        .replace(/\/index$/, ''); // index.mdx → parent slug

      // Remove leading number prefixes used for ordering (e.g. '01-getting-started' → 'getting-started')
      slug = slug
        .split('/')
        .map((part) => part.replace(/^\d+-/, ''))
        .join('/');

      docs.push({
        slug,
        frontmatter: {
          ...frontmatter,
          title: frontmatter.title ?? titleFromFilename(entry),
        },
        content,
        format: 'mdx' as const,
        filePath: relPath.replace(/\\/g, '/'),
        updatedAt: stat.mtime,
      });
    } catch (err) {
      logger.error('Failed to load doc file', { path: fullPath, error: String(err) });
    }
  }

  return docs;
}

/** Default docs directory relative to project root */
const DOCS_DIR = join(process.cwd(), 'docs', 'content');

/** Simple TTL cache for file docs (re-reads from disk every 30s in dev, 5min in prod) */
const CACHE_TTL = process.env.NODE_ENV === 'production' ? 5 * 60 * 1000 : 30 * 1000;
let _cache: { docs: FileDoc[]; dir: string; ts: number } | null = null;

/**
 * Load all file-based documentation.
 * Results are cached with a TTL to avoid re-reading disk on every request.
 */
export function loadFileDocs(docsDir = DOCS_DIR): FileDoc[] {
  const now = Date.now();
  if (_cache && _cache.dir === docsDir && now - _cache.ts < CACHE_TTL) {
    return _cache.docs;
  }
  const docs = loadDir(docsDir, docsDir);
  _cache = { docs, dir: docsDir, ts: now };
  return docs;
}

/**
 * Load a single file doc by slug.
 */
export function loadFileDoc(slug: string, docsDir = DOCS_DIR): FileDoc | null {
  const docs = loadFileDocs(docsDir);
  return docs.find((d) => d.slug === slug) ?? null;
}

/** Clear the file docs cache (useful after writing new docs via AI agent) */
export function invalidateFileDocsCache(): void {
  _cache = null;
}

/**
 * Strip HTML tags from content for plain text / search indexing.
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Convert markdown to plain text (strip markdown syntax for LLM export).
 */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/\*\*(.*?)\*\*/g, '$1') // bold
    .replace(/\*(.*?)\*/g, '$1') // italic
    .replace(/`{3}[\s\S]*?`{3}/g, '') // code blocks
    .replace(/`(.*?)`/g, '$1') // inline code
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links
    .replace(/^\s*[-*+]\s+/gm, '• ') // lists
    .replace(/^\s*\d+\.\s+/gm, '') // numbered lists
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
