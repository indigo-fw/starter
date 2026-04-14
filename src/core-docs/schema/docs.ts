import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { tsvector } from '@/server/db/schema/types';
import { DEFAULT_LOCALE } from '@/lib/constants';

// ─── cms_docs ───────────────────────────────────────────────────────────────
// Documentation pages authored via the CMS admin dashboard.
// File-based docs (.md/.mdx) are loaded from the filesystem and merged at runtime.

export const cmsDocs = pgTable('cms_docs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** URL slug (e.g. 'getting-started/installation'). Supports nested paths. */
  slug: varchar('slug', { length: 500 }).notNull(),
  /** Locale code (e.g. 'en', 'de'). Slug is unique per locale. */
  locale: varchar('locale', { length: 10 }).notNull().default(DEFAULT_LOCALE),
  title: varchar('title', { length: 255 }).notNull(),
  /** Rich text content (HTML from editor) */
  body: text('body').notNull().default(''),
  /** Plain text for search indexing (auto-generated from body) */
  bodyText: text('body_text').notNull().default(''),
  /** Section grouping (e.g. 'Getting Started', 'API Reference') */
  section: varchar('section', { length: 255 }),
  /** Sort order within section */
  sortOrder: integer('sort_order').notNull().default(0),
  /** Parent doc ID for nesting */
  parentId: text('parent_id'),
  /** SEO meta title override */
  metaTitle: varchar('meta_title', { length: 255 }),
  /** SEO meta description */
  metaDescription: varchar('meta_description', { length: 500 }),
  /** Additional metadata (version, tags, etc.) */
  metadata: jsonb('metadata'),
  /** Source: 'cms' for dashboard-authored, 'file' entries are NOT stored here */
  status: varchar('status', { length: 20 }).notNull().default('published'),
  searchVector: tsvector('search_vector'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_docs_slug_locale').on(table.slug, table.locale),
  index('idx_docs_locale').on(table.locale),
  index('idx_docs_section_order').on(table.section, table.sortOrder),
  index('idx_docs_parent').on(table.parentId),
  index('idx_docs_status').on(table.status),
  index('idx_docs_search_vector').using('gin', table.searchVector),
]);
