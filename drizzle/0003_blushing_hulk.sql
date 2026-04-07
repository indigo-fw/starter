ALTER TABLE "cms_posts" ADD COLUMN "search_vector" "tsvector";--> statement-breakpoint
ALTER TABLE "cms_docs" ADD COLUMN "search_vector" "tsvector";--> statement-breakpoint
CREATE INDEX "cms_posts_search_vector_idx" ON "cms_posts" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "idx_docs_search_vector" ON "cms_docs" USING gin ("search_vector");--> statement-breakpoint

-- Shared helper: map 2-letter ISO lang code to PostgreSQL text search config.
-- Falls back to 'simple' (no stemming) for unsupported languages.
-- Adding a new locale? Add a WHEN clause below AND update src/scripts/apply-search-triggers.ts.
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
$$ LANGUAGE plpgsql IMMUTABLE;--> statement-breakpoint

-- Trigger: auto-update search_vector on cms_posts (language-aware)
-- Title weighted 'A' (highest), HTML-stripped content weighted 'B'
CREATE OR REPLACE FUNCTION cms_posts_search_vector_update() RETURNS trigger AS $$
DECLARE
  cfg regconfig := cms_ts_config(NEW.lang);
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector(cfg, coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector(cfg, regexp_replace(coalesce(NEW.content, ''), '<[^>]*>', '', 'g')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER cms_posts_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, content, lang ON "cms_posts"
  FOR EACH ROW
  EXECUTE FUNCTION cms_posts_search_vector_update();--> statement-breakpoint

-- Backfill existing cms_posts rows
UPDATE "cms_posts" SET search_vector =
  setweight(to_tsvector(cms_ts_config(lang), coalesce(title, '')), 'A') ||
  setweight(to_tsvector(cms_ts_config(lang), regexp_replace(coalesce(content, ''), '<[^>]*>', '', 'g')), 'B');--> statement-breakpoint

-- Trigger: auto-update search_vector on cms_docs
-- Docs have no lang column — defaults to 'english'
-- Title weighted 'A', plain-text body weighted 'B'
CREATE OR REPLACE FUNCTION cms_docs_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.body_text, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER cms_docs_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, body_text ON "cms_docs"
  FOR EACH ROW
  EXECUTE FUNCTION cms_docs_search_vector_update();--> statement-breakpoint

-- Backfill existing cms_docs rows
UPDATE "cms_docs" SET search_vector =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(body_text, '')), 'B');
