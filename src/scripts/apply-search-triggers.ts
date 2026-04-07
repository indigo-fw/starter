/**
 * Apply full-text search triggers to the database.
 *
 * This script creates/updates the PostgreSQL functions and triggers needed for
 * tsvector-based full-text search on cms_posts and cms_docs tables.
 *
 * Run manually:  bun run db:search-triggers
 * Also called by: bun run init (after migrations)
 *
 * Safe to run multiple times (uses CREATE OR REPLACE).
 */

import postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

async function apply(sql: Sql) {
  // Shared helper: map 2-letter ISO lang code to PostgreSQL text search config.
  // Adding a new locale? Add a WHEN clause below, then run this script again.
  // Available PG configs: simple, danish, dutch, english, finnish, french, german,
  // hungarian, italian, norwegian, portuguese, romanian, russian, spanish, swedish, turkish.
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION cms_ts_config(lang text) RETURNS regconfig AS $$
    BEGIN
      RETURN CASE lang
        WHEN 'en' THEN 'english'::regconfig
        WHEN 'de' THEN 'german'::regconfig
        WHEN 'es' THEN 'spanish'::regconfig
        WHEN 'fr' THEN 'french'::regconfig
        WHEN 'it' THEN 'italian'::regconfig
        WHEN 'pt' THEN 'portuguese'::regconfig
        WHEN 'nl' THEN 'dutch'::regconfig
        WHEN 'sv' THEN 'swedish'::regconfig
        WHEN 'no' THEN 'norwegian'::regconfig
        WHEN 'da' THEN 'danish'::regconfig
        WHEN 'fi' THEN 'finnish'::regconfig
        WHEN 'hu' THEN 'hungarian'::regconfig
        WHEN 'ro' THEN 'romanian'::regconfig
        WHEN 'ru' THEN 'russian'::regconfig
        WHEN 'tr' THEN 'turkish'::regconfig
        ELSE 'simple'::regconfig
      END;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE
  `);

  // cms_posts trigger (language-aware via lang column)
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION cms_posts_search_vector_update() RETURNS trigger AS $$
    DECLARE
      cfg regconfig := cms_ts_config(NEW.lang);
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector(cfg, coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector(cfg, regexp_replace(coalesce(NEW.content, ''), '<[^>]*>', '', 'g')), 'B');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await sql.unsafe(`DROP TRIGGER IF EXISTS cms_posts_search_vector_trigger ON cms_posts`);
  await sql.unsafe(`
    CREATE TRIGGER cms_posts_search_vector_trigger
      BEFORE INSERT OR UPDATE OF title, content, lang ON cms_posts
      FOR EACH ROW
      EXECUTE FUNCTION cms_posts_search_vector_update()
  `);

  // Backfill cms_posts
  const postsResult = await sql.unsafe(`
    UPDATE cms_posts SET search_vector =
      setweight(to_tsvector(cms_ts_config(lang), coalesce(title, '')), 'A') ||
      setweight(to_tsvector(cms_ts_config(lang), regexp_replace(coalesce(content, ''), '<[^>]*>', '', 'g')), 'B')
  `);

  // cms_docs trigger (no lang column, defaults to english)
  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION cms_docs_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.body_text, '')), 'B');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await sql.unsafe(`DROP TRIGGER IF EXISTS cms_docs_search_vector_trigger ON cms_docs`);
  await sql.unsafe(`
    CREATE TRIGGER cms_docs_search_vector_trigger
      BEFORE INSERT OR UPDATE OF title, body_text ON cms_docs
      FOR EACH ROW
      EXECUTE FUNCTION cms_docs_search_vector_update()
  `);

  // Backfill cms_docs
  const docsResult = await sql.unsafe(`
    UPDATE cms_docs SET search_vector =
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(body_text, '')), 'B')
  `);

  console.log(`  Search triggers applied (posts: ${postsResult.count}, docs: ${docsResult.count} rows backfilled)`);
}

/**
 * Apply search triggers using an existing postgres connection.
 * Used by init.ts to avoid opening a second connection.
 */
export async function applySearchTriggersWithConnection(sql: Sql) {
  await apply(sql);
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
    await apply(sql);
  } finally {
    await sql.end();
  }
}
