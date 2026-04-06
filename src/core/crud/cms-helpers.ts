import { type SQL, and, eq, isNull, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { DbClient } from '@/server/db';
import { cmsSlugRedirects } from '@/server/db/schema';
import { createRevision, pickSnapshot } from './content-revisions';

// ---------------------------------------------------------------------------
// Translation group language batch lookup
// ---------------------------------------------------------------------------

export interface TranslationCols {
  table: PgTable;
  lang: PgColumn;
  translation_group: PgColumn;
}

/**
 * For a batch of translation_group UUIDs, return a map of group → [lang, lang, …].
 */
export async function batchGroupLangs(
  db: DbClient,
  cols: TranslationCols,
  groups: string[],
  extraConditions?: (SQL | undefined)[]
): Promise<Map<string, string[]>> {
  if (groups.length === 0) return new Map();

  const unique = [...new Set(groups)];
  const conditions = [
    sql`${cols.translation_group} IN (${sql.join(
      unique.map((g) => sql`${g}`),
      sql`, `
    )})`,
    ...(extraConditions ?? []),
  ].filter(Boolean);

  const rows = await db
    .select({
      group: cols.translation_group,
      lang: cols.lang,
    })
    .from(cols.table)
    .where(and(...conditions));

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const g = row.group as string;
    const l = row.lang as string;
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(l);
  }
  return map;
}

// ---------------------------------------------------------------------------
// updateWithRevision — wraps revision + slug redirect + update in transaction
// ---------------------------------------------------------------------------

export interface UpdateWithRevisionOpts<T extends Record<string, unknown>> {
  db: DbClient;
  contentType: string;
  contentId: string;
  oldRecord: T;
  snapshotKeys: (keyof T)[];
  userId?: string;
  /** Old slug — if changed, creates a redirect */
  oldSlug?: string;
  /** New slug — compared with oldSlug to detect changes */
  newSlug?: string;
  /** URL prefix for redirect (e.g. '/blog/') */
  urlPrefix?: string;
  /** The actual update callback */
  doUpdate: (db: DbClient) => Promise<void>;
}

export async function updateWithRevision<T extends Record<string, unknown>>(
  opts: UpdateWithRevisionOpts<T>
): Promise<void> {
  const {
    db,
    contentType,
    contentId,
    oldRecord,
    snapshotKeys,
    userId,
    oldSlug,
    newSlug,
    urlPrefix,
    doUpdate,
  } = opts;

  // Create revision snapshot
  const snapshot = pickSnapshot(oldRecord, snapshotKeys);
  await createRevision(db, contentType, contentId, snapshot, userId);

  // Slug redirect if slug changed
  if (oldSlug && newSlug && oldSlug !== newSlug && urlPrefix != null) {
    await db.insert(cmsSlugRedirects).values({
      oldSlug,
      contentType,
      contentId,
      urlPrefix,
    });
  }

  // Execute the update
  await doUpdate(db);
}

// ---------------------------------------------------------------------------
// Find translations for a content item
// ---------------------------------------------------------------------------

export async function findTranslations(
  db: DbClient,
  cols: TranslationCols & { id: PgColumn; deleted_at: PgColumn },
  translationGroup: string | null,
  excludeId?: string
): Promise<Array<{ id: string; lang: string }>> {
  if (!translationGroup) return [];

  const conditions: (SQL | undefined)[] = [
    eq(cols.translation_group, translationGroup),
    isNull(cols.deleted_at),
  ];
  if (excludeId) {
    conditions.push(sql`${cols.id} != ${excludeId}`);
  }

  const rows = await db
    .select({ id: cols.id, lang: cols.lang })
    .from(cols.table)
    .where(and(...conditions));

  return rows as Array<{ id: string; lang: string }>;
}
