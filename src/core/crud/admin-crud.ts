import {
  getAffectedRows,
  isDuplicateKeyError,
  wordSplitLike,
} from './drizzle-utils';
import { TRPCError } from '@trpc/server';
import crypto from 'crypto';
import {
  type AnyColumn,
  type SQL,
  and,
  asc,
  desc,
  count as drizzleCount,
  eq,
  getTableName,
  isNotNull,
  isNull,
  ne,
  sql,
} from 'drizzle-orm';
import type {
  PgColumn,
  PgTable,
  PgTableWithColumns,
} from 'drizzle-orm/pg-core';

import { slugify } from '@/core/lib/content/slug';
import { ContentStatus } from '@/core/types/cms';
import type { DbClient, DrizzleDB, DrizzleDBOrTx } from '@/server/db';
import { cmsContentRevisions, cmsSlugRedirects } from '@/server/db/schema';

// ---------------------------------------------------------------------------
// Column refs for generic CRUD
// ---------------------------------------------------------------------------

export interface CrudColumns {
  table: PgTable;
  id: PgColumn;
  deleted_at: PgColumn;
}

// ---------------------------------------------------------------------------
// Soft-delete / restore / permanent-delete
// ---------------------------------------------------------------------------

export async function softDelete(
  db: DbClient,
  cols: CrudColumns,
  id: string
): Promise<void> {
  const result = await db.execute(
    sql`UPDATE ${cols.table} SET ${sql.identifier(cols.deleted_at.name)} = NOW() WHERE ${cols.id} = ${id} AND ${cols.deleted_at} IS NULL`
  );
  if (getAffectedRows(result) === 0) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Record not found' });
  }
}

export async function softRestore(
  db: DbClient,
  cols: CrudColumns,
  id: string,
  preRestoreCheck?: (db: DbClient, id: string) => Promise<void>
): Promise<void> {
  if (preRestoreCheck) {
    await preRestoreCheck(db, id);
  }
  const result = await db.execute(
    sql`UPDATE ${cols.table} SET ${sql.identifier(cols.deleted_at.name)} = NULL WHERE ${cols.id} = ${id} AND ${cols.deleted_at} IS NOT NULL`
  );
  if (getAffectedRows(result) === 0) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Trashed record not found',
    });
  }
}

export async function permanentDelete(
  db: DrizzleDB,
  cols: CrudColumns,
  id: string,
  contentTypeId: string,
  cascadeDeletes?: (tx: DrizzleDBOrTx, id: string) => Promise<void>
): Promise<void> {
  const [exists] = await db
    .select({ id: cols.id })
    .from(cols.table)
    .where(and(eq(cols.id, id), isNotNull(cols.deleted_at)))
    .limit(1);

  if (!exists) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Trashed record not found',
    });
  }

  await db.transaction(async (tx) => {
    if (cascadeDeletes) await cascadeDeletes(tx, id);
    await tx
      .delete(cmsContentRevisions)
      .where(
        and(
          eq(cmsContentRevisions.contentType, contentTypeId),
          eq(cmsContentRevisions.contentId, id)
        )
      );
    await tx
      .delete(cmsSlugRedirects)
      .where(
        and(
          eq(cmsSlugRedirects.contentType, contentTypeId),
          eq(cmsSlugRedirects.contentId, id)
        )
      );
    await tx.execute(sql`DELETE FROM ${cols.table} WHERE ${cols.id} = ${id}`);
  });
}

// ---------------------------------------------------------------------------
// Admin list query builder
// ---------------------------------------------------------------------------

export interface AdminListInput {
  search?: string;
  trashed?: boolean;
  lang?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface AdminListCols {
  table: PgTable;
  id: PgColumn;
  deleted_at: PgColumn;
  lang: PgColumn;
  translation_group: PgColumn;
}

export async function buildAdminList<T>(
  config: {
    db: DbClient;
    cols: AdminListCols;
    input?: AdminListInput;
    searchColumns: AnyColumn[];
    sortColumns: Record<string, AnyColumn>;
    defaultSort: string;
    extraConditions?: (SQL | undefined)[];
  },
  findFn: (params: {
    where: SQL | undefined;
    orderBy: SQL;
    offset: number;
    limit: number;
  }) => Promise<T[]>
): Promise<{
  results: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const { db, cols, input, searchColumns, sortColumns, defaultSort } = config;
  const page = input?.page ?? 1;
  const pageSize = input?.pageSize ?? 50;
  const offset = (page - 1) * pageSize;

  const conditions: (SQL | undefined)[] = [];
  if (input?.trashed) {
    conditions.push(isNotNull(cols.deleted_at));
  } else {
    conditions.push(isNull(cols.deleted_at));
  }
  if (input?.lang) conditions.push(eq(cols.lang, input.lang));
  if (input?.search) {
    conditions.push(wordSplitLike(input.search, searchColumns));
  }
  if (config.extraConditions) {
    conditions.push(...config.extraConditions);
  }

  const where = and(...conditions.filter(Boolean));

  const sortBy = input?.sortBy ?? defaultSort;
  const sortCol = sortColumns[sortBy] ?? sortColumns[defaultSort]!;
  const orderBy =
    (input?.sortDir ?? 'desc') === 'asc' ? asc(sortCol) : desc(sortCol);

  const [items, countResult] = await Promise.all([
    findFn({ where, orderBy, offset, limit: pageSize }),
    db.select({ count: drizzleCount() }).from(cols.table).where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  return { results: items, total, page, pageSize, totalPages };
}

// ---------------------------------------------------------------------------
// Status counts (admin tabs)
// ---------------------------------------------------------------------------

export interface StatusCountCols {
  table: PgTable;
  status: PgColumn;
  deleted_at: PgColumn;
}

export async function buildStatusCounts(
  db: DbClient,
  cols: StatusCountCols,
  extraWhere?: SQL
): Promise<{
  all: number;
  draft: number;
  published: number;
  scheduled: number;
  trash: number;
}> {
  const result = await db
    .select({
      active: sql<string>`SUM(CASE WHEN ${cols.deleted_at} IS NULL THEN 1 ELSE 0 END)`,
      draft: sql<string>`SUM(CASE WHEN ${cols.deleted_at} IS NULL AND ${cols.status} = ${ContentStatus.DRAFT} THEN 1 ELSE 0 END)`,
      published: sql<string>`SUM(CASE WHEN ${cols.deleted_at} IS NULL AND ${cols.status} = ${ContentStatus.PUBLISHED} THEN 1 ELSE 0 END)`,
      scheduled: sql<string>`SUM(CASE WHEN ${cols.deleted_at} IS NULL AND ${cols.status} = ${ContentStatus.SCHEDULED} THEN 1 ELSE 0 END)`,
      trash: sql<string>`SUM(CASE WHEN ${cols.deleted_at} IS NOT NULL THEN 1 ELSE 0 END)`,
    })
    .from(cols.table)
    .where(extraWhere);
  const r = result[0];
  return {
    all: Number(r?.active ?? 0),
    draft: Number(r?.draft ?? 0),
    published: Number(r?.published ?? 0),
    scheduled: Number(r?.scheduled ?? 0),
    trash: Number(r?.trash ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Slug uniqueness check
// ---------------------------------------------------------------------------

interface SlugScope {
  table: PgTable;
  slugCol: PgColumn;
  idCol?: PgColumn;
  excludeId?: string;
  langCol?: PgColumn;
  lang?: string;
  deletedAtCol?: PgColumn;
  extraConditions?: SQL[];
}

/** One live row already holds `slug` inside the scope? Shared by the throwing and the renaming variants. */
async function isSlugTaken(
  db: DbClient,
  slug: string,
  scope: SlugScope
): Promise<boolean> {
  const conditions: (SQL | undefined)[] = [eq(scope.slugCol, slug)];
  if (scope.langCol && scope.lang) {
    conditions.push(eq(scope.langCol, scope.lang));
  }
  if (scope.idCol && scope.excludeId != null) {
    conditions.push(ne(scope.idCol, scope.excludeId));
  }
  if (scope.deletedAtCol) {
    conditions.push(isNull(scope.deletedAtCol));
  }
  if (scope.extraConditions) {
    conditions.push(...scope.extraConditions);
  }

  const [existing] = await db
    .select({ id: scope.slugCol })
    .from(scope.table)
    .where(and(...conditions))
    .limit(1);

  return Boolean(existing);
}

/**
 * Throws CONFLICT when `config.slug` is already live in its scope. Use this for
 * slugs the user typed — silently renaming what they asked for would be worse
 * than telling them. Auto-generated slugs go through `resolveUniqueSlug`.
 */
export async function ensureSlugUnique(
  db: DbClient,
  config: SlugScope & { slug: string },
  entityName: string
): Promise<void> {
  if (await isSlugTaken(db, config.slug, config)) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `A ${entityName} with slug "${config.slug}" already exists`,
    });
  }
}

/** Numbered suffixes tried before falling back to a random one. */
const SLUG_NUMBERED_ATTEMPTS = 20;
/** Random suffixes tried before giving up — a collision here means the table is adversarial. */
const SLUG_RANDOM_ATTEMPTS = 3;

/**
 * Slugifies `base` and returns the first free variant in the scope:
 * `my-post`, `my-post-2`, … `my-post-20`, then `my-post-<6 hex>`.
 *
 * For slugs the system derives (titles, copies, translations) — never for a
 * slug the user typed, which must CONFLICT via `ensureSlugUnique` instead.
 * `excludeId` lets an update keep its own row out of the probe.
 */
export async function resolveUniqueSlug(
  db: DbClient,
  cols: {
    table: PgTable;
    slug: PgColumn;
    id?: PgColumn;
    lang?: PgColumn;
    deletedAt?: PgColumn;
  },
  base: string,
  scope: { lang?: string; extraConditions?: SQL[] } = {},
  excludeId?: string
): Promise<string> {
  const baseSlug = slugify(base) || 'untitled';
  const probe: SlugScope = {
    table: cols.table,
    slugCol: cols.slug,
    idCol: cols.id,
    excludeId,
    langCol: cols.lang,
    lang: scope.lang,
    deletedAtCol: cols.deletedAt,
    extraConditions: scope.extraConditions,
  };

  for (let n = 1; n <= SLUG_NUMBERED_ATTEMPTS; n++) {
    const candidate = n === 1 ? baseSlug : `${baseSlug}-${n}`;
    if (!(await isSlugTaken(db, candidate, probe))) return candidate;
  }

  for (let i = 0; i < SLUG_RANDOM_ATTEMPTS; i++) {
    const candidate = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;
    if (!(await isSlugTaken(db, candidate, probe))) return candidate;
  }

  throw new TRPCError({
    code: 'CONFLICT',
    message: `Could not find a free slug for "${baseSlug}"`,
  });
}

/**
 * Builds a `softRestore` pre-check that refuses to un-trash a row whose slug has
 * since been reused by a live row. The slug unique indexes are partial
 * (`WHERE deleted_at IS NULL`), so without this the restore itself hits 23505
 * and surfaces as a 500 instead of a CONFLICT the editor can act on.
 *
 * `scopeCols` are extra columns whose value on the trashed row must also match
 * (e.g. post `type`, term `taxonomyId`) — mirror whatever `ensureSlugUnique`
 * scopes on at create/update for the same table.
 */
export function createSlugRestoreCheck(
  cols: {
    table: PgTable;
    idCol: PgColumn;
    slugCol: PgColumn;
    langCol: PgColumn;
    deletedAtCol: PgColumn;
    scopeCols?: PgColumn[];
  },
  entityName: string
): (db: DbClient, id: string) => Promise<void> {
  return async (db, id) => {
    const projection: Record<string, PgColumn> = {
      slug: cols.slugCol,
      lang: cols.langCol,
    };
    for (const col of cols.scopeCols ?? []) projection[col.name] = col;

    const [row] = await db
      .select(projection)
      .from(cols.table)
      .where(eq(cols.idCol, id))
      .limit(1);
    // Missing row: let softRestore report NOT_FOUND through its own path.
    if (!row) return;

    const trashed = row as Record<string, unknown>;
    const extraConditions = (cols.scopeCols ?? []).map((col) =>
      eq(col, trashed[col.name])
    );

    try {
      await ensureSlugUnique(
        db,
        {
          table: cols.table,
          slugCol: cols.slugCol,
          slug: String(trashed.slug),
          langCol: cols.langCol,
          lang: typeof trashed.lang === 'string' ? trashed.lang : undefined,
          deletedAtCol: cols.deletedAtCol,
          extraConditions,
        },
        entityName
      );
    } catch (err) {
      if (err instanceof TRPCError && err.code === 'CONFLICT') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Cannot restore: an active ${entityName} already uses the slug "${String(trashed.slug)}". Rename or trash it first.`,
          cause: err,
        });
      }
      throw err;
    }
  };
}

// ---------------------------------------------------------------------------
// Pagination helpers
// ---------------------------------------------------------------------------

export function parsePagination(
  input?: { page?: number; pageSize?: number },
  defaultPageSize = 20
): { page: number; pageSize: number; offset: number } {
  const page = input?.page ?? 1;
  const pageSize = input?.pageSize ?? defaultPageSize;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function paginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
): {
  results: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
} {
  return {
    results: items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ---------------------------------------------------------------------------
// fetchOrNotFound — fetch single record or throw NOT_FOUND
// ---------------------------------------------------------------------------

/**
 * Fetches a single record by ID or throws NOT_FOUND.
 * Eliminates the repeated select+if(!result) pattern in every router's `get` procedure.
 */
export async function fetchOrNotFound<T>(
  db: DbClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: PgTableWithColumns<any>,
  id: string,
  entityName: string,
  extraConditions?: SQL[]
): Promise<T> {
  const idCol = (table as Record<string, PgColumn>).id;

  const conditions: SQL[] = [eq(idCol, id)];
  if (extraConditions) conditions.push(...extraConditions);
  const [record] = await db
    .select()
    .from(table)
    .where(and(...conditions))
    .limit(1);
  if (!record) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `${entityName} not found`,
    });
  }
  return record as T;
}

// ---------------------------------------------------------------------------
// generateCopySlug — unique slug for duplicated records
// ---------------------------------------------------------------------------

/**
 * Unique copy slug: "my-post-copy", "my-post-copy-2", … then a random suffix
 * (see `resolveUniqueSlug`), so duplicating a heavily-copied record never fails.
 */
export async function generateCopySlug(
  db: DbClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: PgTableWithColumns<any>,
  slugCol: PgColumn,
  deletedAtCol: PgColumn,
  originalSlug: string,
  langCol?: PgColumn,
  lang?: string
): Promise<string> {
  return resolveUniqueSlug(
    db,
    { table, slug: slugCol, lang: langCol, deletedAt: deletedAtCol },
    `${originalSlug}-copy`,
    { lang }
  );
}

// ---------------------------------------------------------------------------
// insertOrConflict — surface unique-index races as CONFLICT, not 500
// ---------------------------------------------------------------------------

/**
 * Runs `insert` and maps a unique violation to CONFLICT. The partial index
 * `<table>_group_lang_uniq` (one live row per language per translation group)
 * gets its own message; the pre-checks (`ensureUniqueInTranslationGroup`,
 * `ensureSlugUnique`) still run first — this only catches the race two
 * concurrent writers can win together, which would otherwise surface as a 500.
 */
export async function insertOrConflict<T>(
  table: PgTable,
  lang: string,
  insert: () => Promise<T>
): Promise<T> {
  try {
    return await insert();
  } catch (err) {
    if (isDuplicateKeyError(err, `${getTableName(table)}_group_lang_uniq`)) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `A ${lang} translation already exists in this group`,
        cause: err,
      });
    }
    if (isDuplicateKeyError(err)) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'A record with the same slug already exists',
        cause: err,
      });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// updateContentStatus — set status with auto publishedAt
// ---------------------------------------------------------------------------

/**
 * Updates content status with auto-publishedAt logic.
 * Replaces the duplicated updateStatus procedure body in categories, portfolio, tags.
 */
export async function updateContentStatus(
  db: DbClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: PgTableWithColumns<any>,
  idCol: PgColumn,
  statusCol: PgColumn,
  publishedAtCol: PgColumn,
  updatedAtCol: PgColumn,
  id: string,
  status: number,
  entityName: string
): Promise<void> {
  const [existing] = await db
    .select({ id: idCol, publishedAt: publishedAtCol })
    .from(table)
    .where(eq(idCol, id))
    .limit(1);
  if (!existing) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `${entityName} not found`,
    });
  }
  const updates: Record<string, unknown> = {
    [statusCol.name]: status,
    [updatedAtCol.name]: new Date(),
  };
  if (status === 1 && !(existing as Record<string, unknown>).publishedAt) {
    updates[publishedAtCol.name] = new Date();
  }
  await db.update(table).set(updates).where(eq(idCol, id));
}

// ---------------------------------------------------------------------------
// getTranslationSiblings — fetch sibling translations by translationGroup
// ---------------------------------------------------------------------------

/**
 * Gets translation siblings for a content item by its translationGroup.
 * Replaces the duplicated getTranslationSiblings procedure in cms, categories, portfolio.
 */
export async function getTranslationSiblings(
  db: DbClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: PgTableWithColumns<any>,
  idCol: PgColumn,
  translationGroupCol: PgColumn,
  langCol: PgColumn,
  slugCol: PgColumn,
  deletedAtCol: PgColumn,
  id: string
): Promise<Array<{ id: string; lang: string; slug: string }>> {
  const [record] = await db
    .select({ translationGroup: translationGroupCol })
    .from(table)
    .where(eq(idCol, id))
    .limit(1);
  if (!(record as Record<string, unknown> | undefined)?.translationGroup)
    return [];
  const group = (record as Record<string, unknown>).translationGroup as string;
  return db
    .select({ id: idCol, lang: langCol, slug: slugCol })
    .from(table)
    .where(
      and(eq(translationGroupCol, group), ne(idCol, id), isNull(deletedAtCol))
    )
    .limit(50) as Promise<Array<{ id: string; lang: string; slug: string }>>;
}

// ---------------------------------------------------------------------------
// serializeExport — bulk export as JSON or TSV
// ---------------------------------------------------------------------------

/**
 * Serializes records for bulk export (JSON or TSV).
 * Replaces the duplicated export logic in cms, categories and portfolio routers.
 */
export function serializeExport(
  items: Record<string, unknown>[],
  headers: string[],
  format: 'json' | 'csv'
): { data: string; contentType: string } {
  if (format === 'json') {
    return {
      data: JSON.stringify(items, null, 2),
      contentType: 'application/json',
    };
  }
  const rows = items.map((row) =>
    headers
      .map((h) => {
        const val = row[h];
        if (val == null) return '';
        if (val instanceof Date) return val.toISOString();
        if (Array.isArray(val)) return val.join(', ');
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val).replace(/\t/g, ' ').replace(/\n/g, '\\n');
      })
      .join('\t')
  );
  return {
    data: [headers.join('\t'), ...rows].join('\n'),
    contentType: 'text/tab-separated-values',
  };
}

// ---------------------------------------------------------------------------
// ensureUniqueInTranslationGroup — one live row per language in a group
// ---------------------------------------------------------------------------

/**
 * Throws CONFLICT when a non-deleted row already holds `lang` in `group`.
 * Fast, readable pre-check in front of the partial unique index
 * `<table>_group_lang_uniq`; `insertOrConflict` maps the index's own 23505
 * (the concurrent-writer race this check cannot see) to the same CONFLICT.
 */
export async function ensureUniqueInTranslationGroup(
  db: DbClient,
  cols: {
    table: PgTable;
    id: PgColumn;
    lang: PgColumn;
    deletedAt: PgColumn;
    translationGroup: PgColumn;
  },
  group: string,
  lang: string,
  excludeId?: string
): Promise<void> {
  const conditions: SQL[] = [
    eq(cols.translationGroup, group),
    eq(cols.lang, lang),
    isNull(cols.deletedAt),
  ];
  if (excludeId != null) conditions.push(ne(cols.id, excludeId));

  const [existing] = await db
    .select({ id: cols.id })
    .from(cols.table)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `A translation for language "${lang}" already exists in this translation group`,
    });
  }
}

// ---------------------------------------------------------------------------
// prepareTranslationCopy — shared infrastructure for duplicateAsTranslation
// ---------------------------------------------------------------------------

/**
 * Handles the shared infrastructure when duplicating content as a translation:
 * 1. Creates or reuses a translation group (updates source if needed)
 * 2. Generates a unique slug for the target language
 * 3. Generates a preview token
 *
 * Each router still handles field translation (DeepL) and insert (type-specific columns).
 */
export async function prepareTranslationCopy(
  db: DbClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: PgTableWithColumns<any>,
  cols: {
    id: PgColumn;
    slug: PgColumn;
    lang: PgColumn;
    deletedAt: PgColumn;
    translationGroup: PgColumn;
  },
  sourceId: string,
  sourceSlug: string,
  sourceTranslationGroup: string | null,
  targetLang: string
): Promise<{ slug: string; translationGroup: string; previewToken: string }> {
  // A group may hold one row per language. Check before touching anything so
  // the caller gets CONFLICT instead of a half-done copy — a fresh source has
  // no group yet and therefore no siblings to collide with.
  if (sourceTranslationGroup) {
    await ensureUniqueInTranslationGroup(
      db,
      {
        table,
        id: cols.id,
        lang: cols.lang,
        deletedAt: cols.deletedAt,
        translationGroup: cols.translationGroup,
      },
      sourceTranslationGroup,
      targetLang
    );
  }

  // Create or reuse translation group
  const translationGroup = sourceTranslationGroup ?? crypto.randomUUID();
  if (!sourceTranslationGroup) {
    await db
      .update(table)
      .set({ [cols.translationGroup.name]: translationGroup })
      .where(eq(cols.id, sourceId));
  }

  // Derived slug, so a taken `<slug>-<lang>` gets a numbered suffix rather
  // than the old unreadable `-<timestamp>` or a CONFLICT the editor can't fix.
  const slug = await resolveUniqueSlug(
    db,
    { table, slug: cols.slug, lang: cols.lang, deletedAt: cols.deletedAt },
    `${sourceSlug}-${targetLang}`,
    { lang: targetLang }
  );

  const previewToken = crypto.randomBytes(32).toString('hex');

  return { slug, translationGroup, previewToken };
}
