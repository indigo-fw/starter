/**
 * Apply full-text search triggers to the database.
 *
 * Run manually:  bun run db:search-triggers
 * Also called by: bun run init (after migrations)
 *
 * Safe to run multiple times (uses CREATE OR REPLACE).
 */

import postgres from 'postgres';
import { applySearchTriggers as applyTriggers } from '@/core/lib/infra/search-triggers';
import type { SearchTriggerTable } from '@/core/lib/infra/search-triggers';

type Sql = ReturnType<typeof postgres>;

const SEARCH_TABLES: SearchTriggerTable[] = [
  {
    table: 'cms_posts',
    functionName: 'cms_posts_search_vector_update',
    triggerName: 'cms_posts_search_vector_trigger',
    langSource: { column: 'lang' },
    columns: [
      { name: 'title', weight: 'A' },
      { name: 'content', weight: 'B', stripHtml: true },
    ],
  },
  {
    table: 'cms_docs',
    functionName: 'cms_docs_search_vector_update',
    triggerName: 'cms_docs_search_vector_trigger',
    langSource: { fixed: 'english' },
    columns: [
      { name: 'title', weight: 'A' },
      { name: 'body_text', weight: 'B' },
    ],
  },
];

/**
 * Apply search triggers using an existing postgres connection.
 * Used by init.ts to avoid opening a second connection.
 */
export async function applySearchTriggersWithConnection(sql: Sql) {
  await applyTriggers(sql, SEARCH_TABLES);
}

/**
 * Apply search triggers by opening a new connection to DATABASE_URL.
 * Used when running as a standalone script.
 */
export async function applySearchTriggers(dbUrl?: string) {
  const url = dbUrl ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const sql = postgres(url, { max: 1 });
  try {
    await applyTriggers(sql, SEARCH_TABLES);
  } finally {
    await sql.end();
  }
}
