import { TRPCError } from '@trpc/server';
import {
  type AnyColumn,
  type SQL,
  and,
  asc,
  desc,
  count as drizzleCount,
  eq,
  isNotNull,
  isNull,
  ne,
  sql,
} from 'drizzle-orm';
import type { PgColumn, PgTable, PgTableWithColumns } from 'drizzle-orm/pg-core';

import crypto from 'crypto';

import type { DbClient, DrizzleDB, DrizzleDBOrTx } from '@/server/db';
import { getAffectedRows, wordSplitLike } from './drizzle-utils';
import { cmsContentRevisions, cmsSlugRedirects } from '@/server/db/schema';
import { ContentStatus } from '@/core/types/cms';

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
    sql`UPDATE ${cols.table} SET ${cols.deleted_at} = NOW() WHERE ${cols.id} = ${id} AND ${cols.deleted_at} IS NULL`
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
    sql`UPDATE ${cols.table} SET ${cols.deleted_at} = NULL WHERE ${cols.id} = ${id} AND ${cols.deleted_at} IS NOT NULL`
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

  const sortCol = sortColumns[input?.sortBy ?? defaultSort];
  const orderBy =
    (input?.sortDir ?? 'desc') === 'asc' ? asc(sortCol!) : desc(sortCol!);

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

export async function ensureSlugUnique(
  db: DbClient,
  config: {
    table: PgTable;
    slugCol: PgColumn;
    slug: string;
    idCol?: PgColumn;
    excludeId?: string;
    langCol?: PgColumn;
    lang?: string;
    deletedAtCol?: PgColumn;
    extraConditions?: SQL[];
  },
  entityName: string
): Promise<void> {
  const conditions: (SQL | undefined)[] = [eq(config.slugCol, config.slug)];
  if (config.langCol && config.lang) {
    conditions.push(eq(config.langCol, config.lang));
  }
  if (config.idCol && config.excludeId != null) {
    conditions.push(ne(config.idCol, config.excludeId));
  }
  if (config.deletedAtCol) {
    conditions.push(isNull(config.deletedAtCol));
  }
  if (config.extraConditions) {
    conditions.push(...config.extraConditions);
  }

  const [existing] = await db
    .select({ id: config.slugCol })
    .from(config.table)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `A ${entityName} with slug "${config.slug}" already exists`,
    });
  }
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
  extraConditions?: SQL[],
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
    throw new TRPCError({ code: 'NOT_FOUND', message: `${entityName} not found` });
  }
  return record as T;
}

// ---------------------------------------------------------------------------
// generateCopySlug — unique slug for duplicated records
// ---------------------------------------------------------------------------

/**
 * Generates a unique copy slug like "my-post-copy", "my-post-copy-2", etc.
 * Replaces the 20-attempt while-loop duplicated in cms, categories, and portfolio routers.
 */
export async function generateCopySlug(
  db: DbClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: PgTableWithColumns<any>,
  slugCol: PgColumn,
  deletedAtCol: PgColumn,
  originalSlug: string,
  langCol?: PgColumn,
  lang?: string,
  maxAttempts = 20,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
    const candidate = `${originalSlug}-copy${suffix}`;
    const conditions: SQL[] = [eq(slugCol, candidate), isNull(deletedAtCol)];
    if (langCol && lang) conditions.push(eq(langCol, lang));
    const [existing] = await db
      .select({ id: slugCol })
      .from(table)
      .where(and(...conditions))
      .limit(1);
    if (!existing) return candidate;
  }
  throw new TRPCError({
    code: 'CONFLICT',
    message: `Could not generate unique slug after ${maxAttempts} attempts`,
  });
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
  entityName: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: idCol, publishedAt: publishedAtCol })
    .from(table)
    .where(eq(idCol, id))
    .limit(1);
  if (!existing) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `${entityName} not found` });
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
  id: string,
): Promise<Array<{ id: string; lang: string; slug: string }>> {
  const [record] = await db
    .select({ translationGroup: translationGroupCol })
    .from(table)
    .where(eq(idCol, id))
    .limit(1);
  if (!(record as Record<string, unknown> | undefined)?.translationGroup) return [];
  const group = (record as Record<string, unknown>).translationGroup as string;
  return db
    .select({ id: idCol, lang: langCol, slug: slugCol })
    .from(table)
    .where(
      and(
        eq(translationGroupCol, group),
        ne(idCol, id),
        isNull(deletedAtCol),
      ),
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
  format: 'json' | 'csv',
): { data: string; contentType: string } {
  if (format === 'json') {
    return { data: JSON.stringify(items, null, 2), contentType: 'application/json' };
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
      .join('\t'),
  );
  return {
    data: [headers.join('\t'), ...rows].join('\n'),
    contentType: 'text/tab-separated-values',
  };
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
  targetLang: string,
): Promise<{ slug: string; translationGroup: string; previewToken: string }> {
  // Create or reuse translation group
  const translationGroup = sourceTranslationGroup ?? crypto.randomUUID();
  if (!sourceTranslationGroup) {
    await db
      .update(table)
      .set({ [cols.translationGroup.name]: translationGroup })
      .where(eq(cols.id, sourceId));
  }

  // Generate unique slug for target language
  let slug = `${sourceSlug}-${targetLang}`;
  const [existing] = await db
    .select({ slug: cols.slug })
    .from(table)
    .where(
      and(
        eq(cols.slug, slug),
        eq(cols.lang, targetLang),
        isNull(cols.deletedAt),
      ),
    )
    .limit(1);
  if (existing) {
    slug = `${slug}-${Date.now()}`;
  }

  const previewToken = crypto.randomBytes(32).toString('hex');

  return { slug, translationGroup, previewToken };
}
