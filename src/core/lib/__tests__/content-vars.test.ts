import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies so the module can be imported without DB/Redis
vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/db/schema/cms', () => ({ cmsOptions: {} }));
vi.mock('@/core/lib/infra/scope', () => ({ getScope: () => null }));
vi.mock('@/config/site', () => ({
  clientEnv: { siteName: 'TestSite', appUrl: 'https://test.example.com' },
  siteDefaults: {
    companyName: 'Test Corp',
    companyAddress: '123 Test Street',
    companyId: 'TC-001',
    companyJurisdiction: 'Testland',
    contactEmail: 'hello@test.example.com',
    companyVat: 'VAT123',
    companyPhone: '+1-555-0100',
    companyCountry: 'Testlandia',
    supportEmail: 'support@test.example.com',
  },
}));

import {
  resolveContentVars,
  resolveRecordVars,
  getContentVarDefs,
} from '../content/vars';

describe('resolveContentVars', () => {
  it('replaces %SITE_NAME% with the configured site name', () => {
    const result = resolveContentVars('Welcome to %SITE_NAME%!');
    expect(result).toBe('Welcome to TestSite!');
  });

  it('replaces %SITE_URL% with the configured site URL', () => {
    const result = resolveContentVars('Visit %SITE_URL%');
    expect(result).toBe('Visit https://test.example.com');
  });

  it('replaces %COMPANY_NAME% with the configured company name', () => {
    const result = resolveContentVars('Copyright %COMPANY_NAME%');
    expect(result).toBe('Copyright Test Corp');
  });

  it('replaces multiple different placeholders in one string', () => {
    const result = resolveContentVars(
      '%SITE_NAME% is operated by %COMPANY_NAME% (%CONTACT_EMAIL%)',
    );
    expect(result).toBe(
      'TestSite is operated by Test Corp (hello@test.example.com)',
    );
  });

  it('replaces the same placeholder appearing multiple times', () => {
    const result = resolveContentVars('%SITE_NAME% - %SITE_NAME%');
    expect(result).toBe('TestSite - TestSite');
  });

  it('replaces %CURRENT_YEAR% with the current year', () => {
    const result = resolveContentVars('Copyright %CURRENT_YEAR%');
    const year = new Date().getFullYear().toString();
    expect(result).toBe(`Copyright ${year}`);
  });

  // Fast path — no percent sign
  it('returns input unchanged when no % is present (fast path)', () => {
    const input = 'No placeholders here at all';
    const result = resolveContentVars(input);
    expect(result).toBe(input);
    // Verify reference identity (fast path returns the same string object)
    expect(result).toBe(input);
  });

  // Unknown placeholders
  it('leaves unknown placeholders as-is', () => {
    const result = resolveContentVars('Hello %NONEXISTENT_VAR%');
    expect(result).toBe('Hello %NONEXISTENT_VAR%');
  });

  it('replaces known placeholders but leaves unknown ones intact', () => {
    const result = resolveContentVars('%SITE_NAME% and %UNKNOWN%');
    expect(result).toBe('TestSite and %UNKNOWN%');
  });

  // Edge cases
  it('returns empty string for empty string input', () => {
    expect(resolveContentVars('')).toBe('');
  });

  it('handles a string that is only a placeholder', () => {
    expect(resolveContentVars('%COMPANY_ADDRESS%')).toBe('123 Test Street');
  });

  it('handles percent signs that are not placeholders', () => {
    // Single percent or non-word characters between percents
    const result = resolveContentVars('100% of users at %SITE_NAME%');
    expect(result).toContain('100% of users at TestSite');
  });

  it('handles adjacent placeholders with no separator', () => {
    const result = resolveContentVars('%SITE_NAME%%SITE_URL%');
    expect(result).toBe('TestSitehttps://test.example.com');
  });
});

describe('resolveRecordVars', () => {
  it('resolves placeholders in all string fields', () => {
    const record = {
      title: 'Welcome to %SITE_NAME%',
      body: 'Contact us at %CONTACT_EMAIL%',
    };
    const result = resolveRecordVars(record);
    expect(result.title).toBe('Welcome to TestSite');
    expect(result.body).toBe('Contact us at hello@test.example.com');
  });

  it('passes through non-string fields unchanged', () => {
    const record = {
      title: '%SITE_NAME%',
      count: 42,
      active: true,
      tags: ['a', 'b'],
    };
    const result = resolveRecordVars(record);
    expect(result.title).toBe('TestSite');
    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
    expect(result.tags).toEqual(['a', 'b']);
  });

  it('returns record as-is when no string fields contain %', () => {
    const record = { title: 'No vars', count: 1 };
    const result = resolveRecordVars(record);
    expect(result).toBe(record); // same reference — fast path
  });
});

describe('getContentVarDefs', () => {
  it('returns an array of variable definitions', () => {
    const defs = getContentVarDefs();
    expect(Array.isArray(defs)).toBe(true);
    expect(defs.length).toBeGreaterThan(0);
  });

  it('includes SITE_NAME with the correct label and value', () => {
    const defs = getContentVarDefs();
    const siteName = defs.find((d) => d.key === 'SITE_NAME');
    expect(siteName).toBeDefined();
    expect(siteName!.label).toBe('Site Name');
    expect(siteName!.value).toBe('TestSite');
  });

  it('includes CURRENT_YEAR', () => {
    const defs = getContentVarDefs();
    const year = defs.find((d) => d.key === 'CURRENT_YEAR');
    expect(year).toBeDefined();
    expect(year!.label).toBe('Current Year');
    expect(year!.value).toBe(new Date().getFullYear().toString());
  });

  it('each definition has key, label, and value', () => {
    const defs = getContentVarDefs();
    for (const def of defs) {
      expect(typeof def.key).toBe('string');
      expect(typeof def.label).toBe('string');
      expect(typeof def.value).toBe('string');
    }
  });
});
