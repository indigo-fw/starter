import { describe, it, expect, vi } from 'vitest';

// Ensure LOCALES has multiple entries for buildAlternates tests.
// Without this mock, another test file's mock of @/lib/constants (e.g., LOCALES: ['en'])
// can leak in shared-process runners like bun test.
vi.mock('@/lib/constants', () => ({
  LOCALES: ['en', 'es', 'de'] as const,
  DEFAULT_LOCALE: 'en',
  LOCALE_LABELS: { en: 'English', es: 'Espa\u00f1ol', de: 'Deutsch' },
  IS_MULTILINGUAL: true,
}));

import { resolveSlug, buildAlternates } from '../resolve';

describe('resolveSlug', () => {
  it('returns null for empty segments', () => {
    expect(resolveSlug([])).toBeNull();
  });

  it('resolves single segment as page', () => {
    const result = resolveSlug(['privacy-policy']);
    expect(result).not.toBeNull();
    expect(result!.contentType.id).toBe('page');
    expect(result!.slug).toBe('privacy-policy');
  });

  it('resolves blog/slug as blog post', () => {
    const result = resolveSlug(['blog', 'my-post']);
    expect(result).not.toBeNull();
    expect(result!.contentType.id).toBe('blog');
    expect(result!.slug).toBe('my-post');
  });

  it('resolves category/slug as category', () => {
    const result = resolveSlug(['category', 'tech']);
    expect(result).not.toBeNull();
    expect(result!.contentType.id).toBe('category');
    expect(result!.slug).toBe('tech');
  });

  it('resolves tag/slug as tag', () => {
    const result = resolveSlug(['tag', 'nextjs']);
    expect(result).not.toBeNull();
    expect(result!.contentType.id).toBe('tag');
    expect(result!.slug).toBe('nextjs');
  });

  it('resolves portfolio/slug as portfolio', () => {
    const result = resolveSlug(['portfolio', 'my-project']);
    expect(result).not.toBeNull();
    expect(result!.contentType.id).toBe('portfolio');
    expect(result!.slug).toBe('my-project');
  });

  it('returns null for prefixed content type without slug', () => {
    expect(resolveSlug(['blog'])).toBeNull();
    expect(resolveSlug(['category'])).toBeNull();
    expect(resolveSlug(['tag'])).toBeNull();
    expect(resolveSlug(['portfolio'])).toBeNull();
  });

  it('returns null for too many segments', () => {
    expect(resolveSlug(['blog', 'post', 'extra'])).toBeNull();
  });

  it('returns null for unknown prefixes with two segments', () => {
    expect(resolveSlug(['unknown', 'slug'])).toBeNull();
  });
});

const BASE_URL = 'https://example.com';

describe('buildAlternates', () => {
  it('returns undefined when no siblings exist', () => {
    const result = buildAlternates(BASE_URL, [], 'en', 'my-post', '/blog/');
    expect(result).toBeUndefined();
  });

  it('returns language map when siblings exist', () => {
    const siblings = [
      { lang: 'de', slug: 'mein-beitrag' },
      { lang: 'es', slug: 'mi-post' },
    ];
    const result = buildAlternates(BASE_URL, siblings, 'en', 'my-post', '/blog/');
    expect(result).toBeDefined();
    expect(result!['en']).toBe('https://example.com/blog/my-post');
    expect(result!['de']).toBe('https://example.com/de/blog/mein-beitrag');
    expect(result!['es']).toBe('https://example.com/es/blog/mi-post');
  });

  it('handles root urlPrefix (pages)', () => {
    const siblings = [{ lang: 'de', slug: 'datenschutz' }];
    const result = buildAlternates(BASE_URL, siblings, 'en', 'privacy-policy', '/');
    expect(result).toBeDefined();
    expect(result!['en']).toBe('https://example.com/privacy-policy');
    expect(result!['de']).toBe('https://example.com/de/datenschutz');
  });

  it('skips siblings with unsupported locale codes', () => {
    const siblings = [
      { lang: 'de', slug: 'mein-beitrag' },
      { lang: 'fr', slug: 'mon-article' }, // fr is not in LOCALES
    ];
    const result = buildAlternates(BASE_URL, siblings, 'en', 'my-post', '/blog/');
    expect(result).toBeDefined();
    expect(result!['fr']).toBeUndefined();
    expect(Object.keys(result!)).toHaveLength(2); // en + de only
  });

  it('returns undefined when only current locale has content', () => {
    const result = buildAlternates(BASE_URL, [], 'en', 'my-post', '/blog/');
    expect(result).toBeUndefined();
  });

  it('uses the provided baseUrl in all output URLs', () => {
    const siblings = [{ lang: 'de', slug: 'test' }];
    const result = buildAlternates('https://custom.dev', siblings, 'en', 'test', '/blog/');
    expect(result).toBeDefined();
    expect(result!['en']).toBe('https://custom.dev/blog/test');
    expect(result!['de']).toBe('https://custom.dev/de/blog/test');
  });
});
