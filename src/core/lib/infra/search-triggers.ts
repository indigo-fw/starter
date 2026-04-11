/**
 * PostgreSQL full-text search trigger builder.
 *
 * Generates the SQL for tsvector-based search on arbitrary tables.
 * Project provides table configs; core builds and applies the SQL.
 *
 * Safe to run multiple times (uses CREATE OR REPLACE / DROP IF EXISTS).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchTriggerTable {
  /** PostgreSQL table name */
  table: string;
  /** Name for the PL/pgSQL trigger function */
  functionName: string;
  /** Name for the trigger */
  triggerName: string;
  /** How to resolve the text search config: from a column (language-aware) or a fixed regconfig */
  langSource: { column: string } | { fixed: string };
  /** Columns to index with their search weights */
  columns: Array<{
    name: string;
    weight: 'A' | 'B' | 'C' | 'D';
    /** Strip HTML tags before indexing (default: false) */
    stripHtml?: boolean;
  }>;
  /** Output column name (default: 'search_vector') */
  vectorColumn?: string;
}

/** Language code → PostgreSQL text search config name */
export type LanguageMap = Record<string, string>;

// ---------------------------------------------------------------------------
// Default language map
// ---------------------------------------------------------------------------

export const DEFAULT_LANGUAGE_MAP: LanguageMap = {
  en: 'english',
  de: 'german',
  es: 'spanish',
  fr: 'french',
  it: 'italian',
  pt: 'portuguese',
  nl: 'dutch',
  sv: 'swedish',
  no: 'norwegian',
  da: 'danish',
  fi: 'finnish',
  hu: 'hungarian',
  ro: 'romanian',
  ru: 'russian',
  tr: 'turkish',
};

// ---------------------------------------------------------------------------
// SQL builders
// ---------------------------------------------------------------------------

/** Build the `cms_ts_config()` PL/pgSQL function that maps lang codes to regconfigs. */
export function buildTsConfigFunction(langMap: LanguageMap = DEFAULT_LANGUAGE_MAP): string {
  const cases = Object.entries(langMap)
    .map(([code, config]) => `        WHEN '${code}' THEN '${config}'::regconfig`)
    .join('\n');

  return `CREATE OR REPLACE FUNCTION cms_ts_config(lang text) RETURNS regconfig AS $$
    BEGIN
      RETURN CASE lang
${cases}
        ELSE 'simple'::regconfig
      END;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE`;
}

function columnExpression(col: { name: string; stripHtml?: boolean }, cfgExpr: string): string {
  const value = col.stripHtml
    ? `regexp_replace(coalesce(NEW.${col.name}, ''), '<[^>]*>', '', 'g')`
    : `coalesce(NEW.${col.name}, '')`;
  return `to_tsvector(${cfgExpr}, ${value})`;
}

function backfillColumnExpression(col: { name: string; stripHtml?: boolean }, cfgExpr: string): string {
  const value = col.stripHtml
    ? `regexp_replace(coalesce(${col.name}, ''), '<[^>]*>', '', 'g')`
    : `coalesce(${col.name}, '')`;
  return `to_tsvector(${cfgExpr}, ${value})`;
}

function getLangConfig(langSource: SearchTriggerTable['langSource'], prefix: string): { cfgExpr: string; langColumn: string | null } {
  if ('column' in langSource) {
    return { cfgExpr: `cms_ts_config(${prefix}${langSource.column})`, langColumn: langSource.column };
  }
  return { cfgExpr: `'${langSource.fixed}'::regconfig`, langColumn: null };
}

/** Build CREATE FUNCTION + DROP/CREATE TRIGGER SQL for one table. */
export function buildSearchTriggerSql(config: SearchTriggerTable): string[] {
  const vec = config.vectorColumn ?? 'search_vector';
  const { cfgExpr, langColumn } = getLangConfig(config.langSource, 'NEW.');

  const vectorParts = config.columns
    .map((col) => `setweight(${columnExpression(col, cfgExpr)}, '${col.weight}')`)
    .join(' ||\n        ');

  const triggerColumns = [
    ...config.columns.map((c) => c.name),
    ...(langColumn ? [langColumn] : []),
  ].join(', ');

  const fnSql = langColumn
    ? `CREATE OR REPLACE FUNCTION ${config.functionName}() RETURNS trigger AS $$
    DECLARE
      cfg regconfig := cms_ts_config(NEW.${langColumn});
    BEGIN
      NEW.${vec} :=
        ${vectorParts.replace(/cms_ts_config\(NEW\.\w+\)/g, 'cfg')};
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql`
    : `CREATE OR REPLACE FUNCTION ${config.functionName}() RETURNS trigger AS $$
    BEGIN
      NEW.${vec} :=
        ${vectorParts};
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql`;

  const dropTrigger = `DROP TRIGGER IF EXISTS ${config.triggerName} ON ${config.table}`;

  const createTrigger = `CREATE TRIGGER ${config.triggerName}
      BEFORE INSERT OR UPDATE OF ${triggerColumns} ON ${config.table}
      FOR EACH ROW
      EXECUTE FUNCTION ${config.functionName}()`;

  return [fnSql, dropTrigger, createTrigger];
}

/** Build UPDATE SQL to backfill search vectors for existing rows. */
export function buildBackfillSql(config: SearchTriggerTable): string {
  const vec = config.vectorColumn ?? 'search_vector';
  const { cfgExpr } = getLangConfig(config.langSource, '');

  const parts = config.columns
    .map((col) => `setweight(${backfillColumnExpression(col, cfgExpr)}, '${col.weight}')`)
    .join(' ||\n      ');

  return `UPDATE ${config.table} SET ${vec} =\n      ${parts}`;
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

type SqlConnection = {
  unsafe: (query: string) => Promise<{ count?: number } & unknown[]>;
};

/**
 * Apply search triggers and backfill existing rows.
 * Uses an existing postgres connection (avoids opening a second one during init).
 */
export async function applySearchTriggers(
  sql: SqlConnection,
  configs: SearchTriggerTable[],
  langMap?: LanguageMap,
): Promise<void> {
  // Create/update the shared language config function
  const hasLangAware = configs.some((c) => 'column' in c.langSource);
  if (hasLangAware) {
    await sql.unsafe(buildTsConfigFunction(langMap));
  }

  for (const config of configs) {
    const statements = buildSearchTriggerSql(config);
    for (const stmt of statements) {
      await sql.unsafe(stmt);
    }

    const backfill = buildBackfillSql(config);
    const result = await sql.unsafe(backfill);
    const count = (result as unknown as { count?: number }).count ?? 0;
    console.log(`  Search trigger applied: ${config.table} (${count} rows backfilled)`);
  }
}
