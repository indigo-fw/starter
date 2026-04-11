import { describe, it, expect } from 'vitest';
import {
  buildTsConfigFunction,
  buildSearchTriggerSql,
  buildBackfillSql,
} from '../infra/search-triggers';
import type { SearchTriggerTable } from '../infra/search-triggers';

describe('buildTsConfigFunction', () => {
  it('generates PL/pgSQL function with language mappings', () => {
    const sql = buildTsConfigFunction({ en: 'english', de: 'german' });

    expect(sql).toContain('CREATE OR REPLACE FUNCTION cms_ts_config');
    expect(sql).toContain("WHEN 'en' THEN 'english'::regconfig");
    expect(sql).toContain("WHEN 'de' THEN 'german'::regconfig");
    expect(sql).toContain("ELSE 'simple'::regconfig");
    expect(sql).toContain('LANGUAGE plpgsql IMMUTABLE');
  });

  it('uses default language map when none provided', () => {
    const sql = buildTsConfigFunction();

    expect(sql).toContain("WHEN 'en' THEN 'english'");
    expect(sql).toContain("WHEN 'fr' THEN 'french'");
    expect(sql).toContain("WHEN 'tr' THEN 'turkish'");
  });
});

describe('buildSearchTriggerSql', () => {
  const langAwareConfig: SearchTriggerTable = {
    table: 'cms_posts',
    functionName: 'cms_posts_search_vector_update',
    triggerName: 'cms_posts_search_vector_trigger',
    langSource: { column: 'lang' },
    columns: [
      { name: 'title', weight: 'A' },
      { name: 'content', weight: 'B', stripHtml: true },
    ],
  };

  const fixedLangConfig: SearchTriggerTable = {
    table: 'cms_docs',
    functionName: 'cms_docs_search_vector_update',
    triggerName: 'cms_docs_search_vector_trigger',
    langSource: { fixed: 'english' },
    columns: [
      { name: 'title', weight: 'A' },
      { name: 'body_text', weight: 'B' },
    ],
  };

  it('generates 3 SQL statements (function, drop trigger, create trigger)', () => {
    const stmts = buildSearchTriggerSql(langAwareConfig);
    expect(stmts).toHaveLength(3);
  });

  it('generates language-aware function with DECLARE block', () => {
    const [fnSql] = buildSearchTriggerSql(langAwareConfig);

    expect(fnSql).toContain('DECLARE');
    expect(fnSql).toContain('cfg regconfig := cms_ts_config(NEW.lang)');
    expect(fnSql).toContain("setweight(");
    expect(fnSql).toContain("'A'");
    expect(fnSql).toContain("'B'");
  });

  it('strips HTML for columns with stripHtml flag', () => {
    const [fnSql] = buildSearchTriggerSql(langAwareConfig);

    expect(fnSql).toContain("regexp_replace(coalesce(NEW.content, ''), '<[^>]*>', '', 'g')");
    expect(fnSql).not.toContain("regexp_replace(coalesce(NEW.title");
  });

  it('generates fixed-language function without DECLARE', () => {
    const [fnSql] = buildSearchTriggerSql(fixedLangConfig);

    expect(fnSql).not.toContain('DECLARE');
    expect(fnSql).toContain("'english'::regconfig");
  });

  it('includes lang column in trigger ON clause for lang-aware tables', () => {
    const [, , createTrigger] = buildSearchTriggerSql(langAwareConfig);

    expect(createTrigger).toContain('UPDATE OF title, content, lang');
  });

  it('excludes lang column from trigger ON clause for fixed-lang tables', () => {
    const [, , createTrigger] = buildSearchTriggerSql(fixedLangConfig);

    expect(createTrigger).toContain('UPDATE OF title, body_text ON');
    expect(createTrigger).not.toContain('lang');
  });

  it('generates DROP TRIGGER IF EXISTS', () => {
    const [, dropSql] = buildSearchTriggerSql(langAwareConfig);

    expect(dropSql).toBe('DROP TRIGGER IF EXISTS cms_posts_search_vector_trigger ON cms_posts');
  });
});

describe('buildBackfillSql', () => {
  it('generates UPDATE with language-aware config', () => {
    const sql = buildBackfillSql({
      table: 'cms_posts',
      functionName: 'fn',
      triggerName: 'tr',
      langSource: { column: 'lang' },
      columns: [
        { name: 'title', weight: 'A' },
        { name: 'content', weight: 'B', stripHtml: true },
      ],
    });

    expect(sql).toContain('UPDATE cms_posts SET search_vector');
    expect(sql).toContain('cms_ts_config(lang)');
    expect(sql).toContain("regexp_replace(coalesce(content, ''), '<[^>]*>', '', 'g')");
  });

  it('generates UPDATE with fixed config', () => {
    const sql = buildBackfillSql({
      table: 'cms_docs',
      functionName: 'fn',
      triggerName: 'tr',
      langSource: { fixed: 'english' },
      columns: [{ name: 'title', weight: 'A' }],
    });

    expect(sql).toContain('UPDATE cms_docs SET search_vector');
    expect(sql).toContain("'english'::regconfig");
  });

  it('uses custom vectorColumn name', () => {
    const sql = buildBackfillSql({
      table: 't',
      functionName: 'fn',
      triggerName: 'tr',
      langSource: { fixed: 'english' },
      columns: [{ name: 'title', weight: 'A' }],
      vectorColumn: 'fts_vector',
    });

    expect(sql).toContain('SET fts_vector');
  });
});
