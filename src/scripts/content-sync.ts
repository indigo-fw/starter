/**
 * Content Sync CLI
 *
 * Syncs .md files from content/{locale}/ into CMS database tables.
 *
 * Usage:
 *   bun run content:sync              — sync all .md files
 *   bun run content:sync -- --dry-run — preview changes without writing
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import * as schema from '@/server/db/schema';
import { CONTENT_TYPES } from '@/config/cms';
import { LOCALES } from '@/lib/constants';
import { syncContentFiles } from '@/core/lib/content-sync';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const sql = postgres(databaseUrl);
  const db = drizzle(sql, { schema });

  if (dryRun) console.log('🔍 Dry run — no changes will be made\n');

  const result = await syncContentFiles(db, {
    dryRun,
    contentTypes: CONTENT_TYPES,
    locales: LOCALES,
  });

  console.log(`\n✅ Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);
  await sql.end();
}

main().catch((err) => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
