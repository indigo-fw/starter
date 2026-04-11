import { describe, it, expect, beforeEach } from 'vitest';
import { setCanonicalConfig, buildCanonicalUrl, buildAlternates } from '../seo/canonical';

describe('buildCanonicalUrl', () => {
  beforeEach(() => {
    setCanonicalConfig({
      siteUrl: 'https://example.com',
      defaultLocale: 'en',
      localePath: (path, locale) => (locale === 'en' ? path : `/${locale}${path}`),
    });
  });

  it('builds absolute URL for default locale', () => {
    expect(buildCanonicalUrl('/blog/post')).toBe('https://example.com/blog/post');
  });

  it('builds locale-prefixed URL for non-default locale', () => {
    expect(buildCanonicalUrl('/blog/post', 'de')).toBe('https://example.com/de/blog/post');
  });

  it('uses default locale when none specified', () => {
    expect(buildCanonicalUrl('/about')).toBe('https://example.com/about');
  });

  it('handles root path', () => {
    expect(buildCanonicalUrl('/')).toBe('https://example.com/');
    expect(buildCanonicalUrl('/', 'fr')).toBe('https://example.com/fr/');
  });
});

describe('buildAlternates', () => {
  beforeEach(() => {
    setCanonicalConfig({
      siteUrl: 'https://example.com',
      defaultLocale: 'en',
      localePath: (path, locale) => (locale === 'en' ? path : `/${locale}${path}`),
    });
  });

  it('returns alternates map for multiple locales', () => {
    const result = buildAlternates('/blog', ['en', 'de', 'fr']);

    expect(result).toEqual({
      en: 'https://example.com/blog',
      de: 'https://example.com/de/blog',
      fr: 'https://example.com/fr/blog',
      'x-default': 'https://example.com/blog',
    });
  });

  it('returns undefined for single locale', () => {
    expect(buildAlternates('/blog', ['en'])).toBeUndefined();
  });
});
