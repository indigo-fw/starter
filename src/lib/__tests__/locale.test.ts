import { describe, it, expect } from 'vitest';
import { localePath } from '../locale';

describe('localePath', () => {
  it('returns path unchanged for default locale (en)', () => {
    expect(localePath('/blog/my-post', 'en')).toBe('/blog/my-post');
    expect(localePath('/', 'en')).toBe('/');
    expect(localePath('/category/tech', 'en')).toBe('/category/tech');
  });

  it('prepends locale prefix for non-default locales', () => {
    expect(localePath('/blog/my-post', 'de')).toBe('/de/blog/my-post');
    expect(localePath('/category/tech', 'es')).toBe('/es/category/tech');
  });

  it('handles root path for non-default locale', () => {
    expect(localePath('/', 'de')).toBe('/de/');
  });

  it('normalizes paths without leading slash', () => {
    expect(localePath('blog/my-post', 'de')).toBe('/de/blog/my-post');
    expect(localePath('blog/my-post', 'en')).toBe('blog/my-post');
  });

  it('handles single-segment paths', () => {
    expect(localePath('/privacy-policy', 'es')).toBe('/es/privacy-policy');
    expect(localePath('/privacy-policy', 'en')).toBe('/privacy-policy');
  });

  it('handles deeply nested paths', () => {
    expect(localePath('/a/b/c/d', 'de')).toBe('/de/a/b/c/d');
  });
});
