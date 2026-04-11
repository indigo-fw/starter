import { describe, it, expect } from 'vitest';
import { generateSitemap } from '../seo/sitemap';
import type { SitemapConfig, SitemapStaticPage, SitemapFetcher } from '../seo/sitemap';

const BASE_CONFIG: SitemapConfig = {
  siteUrl: 'https://example.com',
  locales: ['en', 'de'],
  defaultLocale: 'en',
  isMultilingual: true,
  localePath: (path, locale) => (locale === 'en' ? path : `/${locale}${path}`),
};

const SINGLE_LOCALE_CONFIG: SitemapConfig = {
  ...BASE_CONFIG,
  locales: ['en'],
  isMultilingual: false,
};

describe('generateSitemap', () => {
  it('generates entries for static pages per locale', async () => {
    const pages: SitemapStaticPage[] = [
      { path: '/', changeFrequency: 'daily', priority: 0.9, defaultLocalePriority: 1 },
    ];

    const entries = await generateSitemap(BASE_CONFIG, pages, []);

    expect(entries).toHaveLength(2); // en + de
    expect(entries[0].url).toBe('https://example.com/');
    expect(entries[0].priority).toBe(1); // defaultLocalePriority
    expect(entries[1].url).toBe('https://example.com/de/');
    expect(entries[1].priority).toBe(0.9);
  });

  it('includes hreflang alternates when multilingual', async () => {
    const pages: SitemapStaticPage[] = [
      { path: '/about', changeFrequency: 'monthly', priority: 0.5 },
    ];

    const entries = await generateSitemap(BASE_CONFIG, pages, []);

    expect(entries[0].alternates?.languages).toEqual({
      en: 'https://example.com/about',
      de: 'https://example.com/de/about',
    });
  });

  it('omits alternates for single-locale sites', async () => {
    const pages: SitemapStaticPage[] = [
      { path: '/', changeFrequency: 'daily', priority: 1 },
    ];

    const entries = await generateSitemap(SINGLE_LOCALE_CONFIG, pages, []);

    expect(entries).toHaveLength(1);
    expect(entries[0].alternates).toBeUndefined();
  });

  it('generates entries from content fetchers', async () => {
    const fetchers: SitemapFetcher[] = [
      {
        urlPrefix: '/blog/',
        priority: 0.6,
        changeFrequency: 'weekly',
        fetch: async () => [
          { slug: 'hello-world', updatedAt: new Date('2025-01-01') },
          { slug: 'second-post', updatedAt: null },
        ],
      },
    ];

    const entries = await generateSitemap(SINGLE_LOCALE_CONFIG, [], fetchers);

    expect(entries).toHaveLength(2);
    expect(entries[0].url).toBe('https://example.com/blog/hello-world');
    expect(entries[0].lastModified).toEqual(new Date('2025-01-01'));
    expect(entries[1].url).toBe('https://example.com/blog/second-post');
    expect(entries[1].lastModified).toBeUndefined();
  });

  it('handles root urlPrefix correctly', async () => {
    const fetchers: SitemapFetcher[] = [
      {
        urlPrefix: '/',
        priority: 0.7,
        changeFrequency: 'weekly',
        fetch: async () => [{ slug: 'about' }],
      },
    ];

    const entries = await generateSitemap(SINGLE_LOCALE_CONFIG, [], fetchers);

    expect(entries[0].url).toBe('https://example.com/about');
  });

  it('combines static pages and fetcher results', async () => {
    const pages: SitemapStaticPage[] = [
      { path: '/', changeFrequency: 'daily', priority: 1 },
    ];
    const fetchers: SitemapFetcher[] = [
      {
        urlPrefix: '/blog/',
        priority: 0.6,
        changeFrequency: 'weekly',
        fetch: async () => [{ slug: 'post-1' }],
      },
    ];

    const entries = await generateSitemap(SINGLE_LOCALE_CONFIG, pages, fetchers);

    expect(entries).toHaveLength(2);
    expect(entries[0].url).toContain('/');
    expect(entries[1].url).toContain('/blog/post-1');
  });

  it('fetches per locale for multilingual sites', async () => {
    const fetchCalls: string[] = [];
    const fetchers: SitemapFetcher[] = [
      {
        urlPrefix: '/blog/',
        priority: 0.6,
        changeFrequency: 'weekly',
        fetch: async (locale) => {
          fetchCalls.push(locale);
          return [{ slug: `post-${locale}` }];
        },
      },
    ];

    const entries = await generateSitemap(BASE_CONFIG, [], fetchers);

    expect(fetchCalls).toEqual(['en', 'de']);
    expect(entries).toHaveLength(2);
    expect(entries[0].url).toBe('https://example.com/blog/post-en');
    expect(entries[1].url).toBe('https://example.com/de/blog/post-de');
  });

  it('returns empty array when no pages or fetchers', async () => {
    const entries = await generateSitemap(SINGLE_LOCALE_CONFIG, [], []);
    expect(entries).toEqual([]);
  });
});
