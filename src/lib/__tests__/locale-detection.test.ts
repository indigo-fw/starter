import { describe, it, expect } from 'vitest';
import { LOCALES, DEFAULT_LOCALE } from '../constants';
import type { Locale } from '../constants';

/**
 * Tests for the locale detection logic used in proxy.ts and useLocale.ts.
 * Extracted as a pure function to test without Next.js runtime dependencies.
 */

const NON_DEFAULT_LOCALE_SET: Set<string> = new Set(
  LOCALES.filter((l) => l !== DEFAULT_LOCALE)
);

/** Detect locale from a URL pathname (mirrors proxy.ts + useLocale.ts logic) */
function detectLocale(pathname: string): {
  locale: Locale;
  strippedPath: string;
} {
  const segments = pathname.split('/');
  const firstSegment = segments[1]; // segments[0] is '' (leading slash)

  if (firstSegment && NON_DEFAULT_LOCALE_SET.has(firstSegment)) {
    const locale = firstSegment as Locale;
    const strippedPath = '/' + segments.slice(2).join('/') || '/';
    return { locale, strippedPath };
  }

  return { locale: DEFAULT_LOCALE, strippedPath: pathname };
}

describe('locale detection from pathname', () => {
  it('returns default locale for unprefixed paths', () => {
    expect(detectLocale('/blog/my-post')).toEqual({
      locale: 'en',
      strippedPath: '/blog/my-post',
    });
    expect(detectLocale('/')).toEqual({
      locale: 'en',
      strippedPath: '/',
    });
    expect(detectLocale('/category/tech')).toEqual({
      locale: 'en',
      strippedPath: '/category/tech',
    });
  });

  it('detects non-default locale and strips prefix', () => {
    expect(detectLocale('/de/blog/my-post')).toEqual({
      locale: 'de',
      strippedPath: '/blog/my-post',
    });
    expect(detectLocale('/es/category/tech')).toEqual({
      locale: 'es',
      strippedPath: '/category/tech',
    });
  });

  it('handles locale prefix with root path', () => {
    expect(detectLocale('/de/')).toEqual({
      locale: 'de',
      strippedPath: '/',
    });
    // /de with no trailing slash
    expect(detectLocale('/de')).toEqual({
      locale: 'de',
      strippedPath: '/',
    });
  });

  it('does not treat default locale as prefix', () => {
    // /en/blog should NOT strip — default locale has no prefix
    expect(detectLocale('/en/blog')).toEqual({
      locale: 'en',
      strippedPath: '/en/blog',
    });
  });

  it('does not match invalid locale codes', () => {
    expect(detectLocale('/xx/blog')).toEqual({
      locale: 'en',
      strippedPath: '/xx/blog',
    });
    expect(detectLocale('/dashboard/login')).toEqual({
      locale: 'en',
      strippedPath: '/dashboard/login',
    });
  });

  it('handles deeply nested locale paths', () => {
    expect(detectLocale('/es/a/b/c')).toEqual({
      locale: 'es',
      strippedPath: '/a/b/c',
    });
  });
});

describe('LOCALES configuration', () => {
  it('includes the default locale', () => {
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });

  it('has at least one non-default locale', () => {
    expect(LOCALES.length).toBeGreaterThan(1);
  });

  it('all locale codes are short strings', () => {
    for (const locale of LOCALES) {
      expect(locale.length).toBeLessThanOrEqual(5);
      expect(locale.length).toBeGreaterThanOrEqual(2);
    }
  });
});
