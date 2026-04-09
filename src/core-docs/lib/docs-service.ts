import { eq, and, asc, sql, desc } from 'drizzle-orm';
import { ilikePattern } from '@/core/crud/drizzle-utils';
import { db } from '@/server/db';
import { cmsDocs } from '@/core-docs/schema/docs';
import { loadFileDocs, loadFileDoc, stripHtml, markdownToPlainText, type FileDoc } from './docs-loader';
import { compileMdx } from '@/core/lib/mdx-compiler';

export interface UnifiedDoc {
  slug: string;
  title: string;
  /** Raw content — HTML for CMS, markdown for file docs */
  body: string;
  /** Plain text for search/LLM */
  bodyText: string;
  section: string | null;
  sortOrder: number;
  parentSlug: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  /** 'cms' | 'mdx' */
  source: string;
  updatedAt: Date;
}

/** UnifiedDoc with pre-rendered HTML — returned by getDocBySlug only. */
export interface RenderedDoc extends UnifiedDoc {
  /** Pre-rendered HTML (compiled from mdx, or same as body for CMS) */
  renderedBody: string;
}

export interface DocNavItem {
  slug: string;
  title: string;
  section: string | null;
  sortOrder: number;
  children: DocNavItem[];
}

/**
 * Convert a file-based doc to the unified format.
 */
function fileDocToUnified(doc: FileDoc): UnifiedDoc {
  return {
    slug: doc.slug,
    title: doc.frontmatter.title ?? doc.slug,
    body: doc.content,
    bodyText: markdownToPlainText(doc.content),
    section: doc.frontmatter.section ?? null,
    sortOrder: doc.frontmatter.order ?? 0,
    parentSlug: doc.slug.includes('/') ? doc.slug.split('/').slice(0, -1).join('/') : null,
    metaTitle: null,
    metaDescription: doc.frontmatter.description ?? null,
    source: doc.format,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Get all docs from both sources, merged into a single list.
 * File-based docs take priority over CMS docs with the same slug.
 */
export async function getAllDocs(): Promise<UnifiedDoc[]> {
  // Load file-based docs
  const fileDocs = loadFileDocs().map((d) => fileDocToUnified(d));

  // Load CMS docs
  const cmsDocsRows = await db
    .select()
    .from(cmsDocs)
    .where(eq(cmsDocs.status, 'published'))
    .orderBy(asc(cmsDocs.sortOrder))
    .limit(1000);

  // Build parentId → slug lookup for CMS docs
  const idToSlug = new Map(cmsDocsRows.map((r) => [r.id, r.slug]));

  const cmsUnified: UnifiedDoc[] = cmsDocsRows.map((row) => ({
    slug: row.slug,
    title: row.title,
    body: row.body,
    bodyText: row.bodyText || stripHtml(row.body),
    section: row.section,
    sortOrder: row.sortOrder,
    parentSlug: row.parentId ? (idToSlug.get(row.parentId) ?? null) : null,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    source: 'cms',
    updatedAt: row.updatedAt,
  }));

  // Merge: file docs override CMS docs with same slug
  const slugMap = new Map<string, UnifiedDoc>();
  for (const doc of cmsUnified) slugMap.set(doc.slug, doc);
  for (const doc of fileDocs) slugMap.set(doc.slug, doc); // file wins

  return [...slugMap.values()].sort((a, b) => {
    // Sort by section, then order
    if (a.section !== b.section) return (a.section ?? '').localeCompare(b.section ?? '');
    return a.sortOrder - b.sortOrder;
  });
}

/**
 * Get a single doc by slug (checks file first, then CMS).
 */
export async function getDocBySlug(slug: string): Promise<RenderedDoc | null> {
  // Check file-based first (takes priority)
  const fileDoc = loadFileDoc(slug);
  if (fileDoc) {
    const cacheKey = `docs:${slug}:${fileDoc.updatedAt.getTime()}`;
    const renderedBody = await compileMdx(fileDoc.content, cacheKey);
    return { ...fileDocToUnified(fileDoc), renderedBody };
  }

  // Fall back to CMS
  const [cmsDoc] = await db
    .select()
    .from(cmsDocs)
    .where(and(eq(cmsDocs.slug, slug), eq(cmsDocs.status, 'published')))
    .limit(1);

  if (!cmsDoc) return null;

  return {
    slug: cmsDoc.slug,
    title: cmsDoc.title,
    body: cmsDoc.body,
    renderedBody: cmsDoc.body,
    bodyText: cmsDoc.bodyText || stripHtml(cmsDoc.body),
    section: cmsDoc.section,
    sortOrder: cmsDoc.sortOrder,
    parentSlug: null,
    metaTitle: cmsDoc.metaTitle,
    metaDescription: cmsDoc.metaDescription,
    source: 'cms',
    updatedAt: cmsDoc.updatedAt,
  };
}

/**
 * Build navigation tree from all docs.
 */
export async function getDocsNavigation(): Promise<DocNavItem[]> {
  const docs = await getAllDocs();

  const items: DocNavItem[] = docs.map((d) => ({
      slug: d.slug,
      title: d.title,
      section: d.section,
      sortOrder: d.sortOrder,
      children: [],
    }));

  // Build parent-child relationships from slug hierarchy
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const roots: DocNavItem[] = [];

  for (const item of items) {
    const parentSlug = item.slug.includes('/')
      ? item.slug.split('/').slice(0, -1).join('/')
      : null;

    if (parentSlug && bySlug.has(parentSlug)) {
      bySlug.get(parentSlug)!.children.push(item);
    } else {
      roots.push(item);
    }
  }

  return roots;
}

/**
 * Generate LLM-friendly plain text export of all docs.
 * Returns a single markdown string with all documentation concatenated.
 */
export async function generateLlmExport(): Promise<string> {
  const docs = await getAllDocs();

  const sections = new Map<string, UnifiedDoc[]>();
  for (const doc of docs) {
    const section = doc.section ?? 'General';
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section)!.push(doc);
  }

  const parts: string[] = [
    '# Documentation\n',
    `> Generated at ${new Date().toISOString()}\n`,
  ];

  for (const [section, sectionDocs] of sections) {
    parts.push(`\n## ${section}\n`);
    for (const doc of sectionDocs) {
      parts.push(`\n### ${doc.title}\n`);
      // For CMS docs, convert HTML to plain text; for file docs, use raw markdown
      if (doc.source === 'cms') {
        parts.push(stripHtml(doc.body));
      } else {
        parts.push(doc.body);
      }
      parts.push('\n');
    }
  }

  const { resolveContentVars } = await import('@/core/lib/content-vars');
  return resolveContentVars(parts.join('\n'));
}

/**
 * Full-text search across all docs.
 * Uses tsvector for CMS docs (ranked, with highlighted excerpts) and
 * substring matching for file-based docs. File-based results with the
 * same slug override CMS results (consistent with the rest of the system).
 */
export async function searchDocs(query: string, limit = 20): Promise<Array<{ slug: string; title: string; excerpt: string }>> {
  if (!query.trim()) return [];

  const q = query.toLowerCase();

  // File-based docs: substring match (no DB, no tsvector)
  const fileDocs = loadFileDocs().map((d) => fileDocToUnified(d));
  const fileResults = fileDocs
    .filter((d) => d.title.toLowerCase().includes(q) || d.bodyText.toLowerCase().includes(q))
    .map((d) => {
      const idx = d.bodyText.toLowerCase().indexOf(q);
      const start = Math.max(0, idx - 80);
      const end = Math.min(d.bodyText.length, idx + q.length + 80);
      const excerpt = (start > 0 ? '...' : '') + d.bodyText.slice(start, end) + (end < d.bodyText.length ? '...' : '');
      return { slug: d.slug, title: d.title, excerpt };
    });
  const fileSlugs = new Set(fileResults.map((r) => r.slug));

  // CMS docs: tsvector full-text search (ranked)
  let cmsResults: Array<{ slug: string; title: string; excerpt: string }> = [];
  if (query.length >= 3) {
    const tsQuery = sql`plainto_tsquery('english', ${query})`;
    const rows = await db
      .select({
        slug: cmsDocs.slug,
        title: cmsDocs.title,
        excerpt: sql<string>`ts_headline('english', coalesce(${cmsDocs.bodyText}, ''), ${tsQuery}, 'MaxWords=35, MinWords=15, StartSel=<mark>, StopSel=</mark>')`.as('excerpt'),
      })
      .from(cmsDocs)
      .where(and(
        eq(cmsDocs.status, 'published'),
        sql`${cmsDocs.searchVector} @@ ${tsQuery}`,
      ))
      .orderBy(desc(sql`ts_rank(${cmsDocs.searchVector}, ${tsQuery})`))
      .limit(limit);
    cmsResults = rows;
  } else {
    // Short queries: ILIKE fallback
    const pattern = ilikePattern(query);
    const rows = await db
      .select({
        slug: cmsDocs.slug,
        title: cmsDocs.title,
        bodyText: cmsDocs.bodyText,
      })
      .from(cmsDocs)
      .where(and(
        eq(cmsDocs.status, 'published'),
        sql`(${cmsDocs.title} ILIKE ${pattern} OR ${cmsDocs.bodyText} ILIKE ${pattern})`,
      ))
      .limit(limit);
    cmsResults = rows.map((r) => {
      const idx = r.bodyText.toLowerCase().indexOf(q);
      const start = Math.max(0, idx - 80);
      const end = Math.min(r.bodyText.length, idx + q.length + 80);
      const excerpt = (start > 0 ? '...' : '') + r.bodyText.slice(start, end) + (end < r.bodyText.length ? '...' : '');
      return { slug: r.slug, title: r.title, excerpt };
    });
  }

  // Merge: file-based docs win over CMS docs with same slug
  const merged = [...fileResults];
  for (const r of cmsResults) {
    if (!fileSlugs.has(r.slug)) merged.push(r);
  }

  return merged.slice(0, limit);
}
