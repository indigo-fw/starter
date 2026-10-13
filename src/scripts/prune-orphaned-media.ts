/**
 * Prune orphaned content-media storage objects.
 *
 * Companion GC step for the content image sync (src/core/lib/content/
 * image-sync.ts). When an image is edited in place, the sync uploads a new
 * cache-busted object and tombstones the previous attachment row with
 * `deletedAt`. This script physically deletes the superseded object and its row
 * once it's been superseded longer than the grace window — decoupled from the
 * sync on purpose, so a deploy rolled back within the window still has the old
 * object available.
 *
 * Scoped to `source_path IS NOT NULL` so it NEVER touches hand-uploaded
 * attachments (which leave sourcePath null and are managed via the CMS UI).
 *
 * Usage:
 *   bun run src/scripts/prune-orphaned-media.ts            — delete eligible
 *   bun run src/scripts/prune-orphaned-media.ts --dry-run  — list only
 */

import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { getStorage } from '@/core/storage';
import * as schema from '@/server/db/schema';
import { cmsPostAttachments } from '@/server/db/schema/cms';

/** Grace period (days) between supersede (deletedAt) and physical purge. */
const GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const sql = postgres(databaseUrl);
  const db = drizzle(sql, { schema });
  const storage = getStorage();
  const cutoff = new Date(Date.now() - GRACE_DAYS * DAY_MS);

  const rows = await db
    .select({
      id: cmsPostAttachments.id,
      filepath: cmsPostAttachments.filepath,
      sourcePath: cmsPostAttachments.sourcePath,
    })
    .from(cmsPostAttachments)
    .where(
      and(
        isNotNull(cmsPostAttachments.sourcePath),
        isNotNull(cmsPostAttachments.deletedAt),
        lte(cmsPostAttachments.deletedAt, cutoff),
      ),
    )
    .limit(1000);

  if (rows.length === 0) {
    console.log(`✅ Nothing to prune (superseded > ${GRACE_DAYS}d).`);
    await sql.end();
    process.exit(0);
  }

  console.log(
    `${dryRun ? '[dry run] ' : ''}Pruning ${rows.length} orphaned content-media object(s)`,
  );

  let purged = 0;
  for (const row of rows) {
    console.log(`  purge ${row.sourcePath} → ${row.filepath}`);
    if (dryRun) continue;
    // storage.delete() already swallows "not found"; still remove the row so it
    // stops being scanned even if the object was already gone.
    await storage.delete(row.filepath);
    await db
      .delete(cmsPostAttachments)
      .where(eq(cmsPostAttachments.id, row.id));
    purged++;
  }

  console.log(`${dryRun ? '[dry run] ' : ''}✅ Pruned ${purged} object(s).`);
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Prune failed:', err);
  process.exit(1);
});
