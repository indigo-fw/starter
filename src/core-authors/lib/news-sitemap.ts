/**
 * Google News Sitemap generator.
 *
 * Generates XML conforming to the Google News sitemap protocol:
 * https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
 *
 * Only includes articles published within the last 2 days (Google News requirement).
 */

import { escapeXml } from '@/core/lib/content/rss';

interface NewsArticle {
  /** Absolute URL of the article */
  url: string;
  /** Article title */
  title: string;
  /** Publication date */
  publishedAt: Date;
  /** Language code (e.g. 'en') */
  lang: string;
}

interface NewsSitemapConfig {
  /** Publication name (as registered with Google News) */
  publicationName: string;
}

export function generateNewsSitemap(
  config: NewsSitemapConfig,
  articles: NewsArticle[],
): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">',
  ];

  for (const article of articles) {
    lines.push('  <url>');
    lines.push(`    <loc>${escapeXml(article.url)}</loc>`);
    lines.push('    <news:news>');
    lines.push('      <news:publication>');
    lines.push(`        <news:name>${escapeXml(config.publicationName)}</news:name>`);
    lines.push(`        <news:language>${escapeXml(article.lang)}</news:language>`);
    lines.push('      </news:publication>');
    lines.push(`      <news:publication_date>${article.publishedAt.toISOString()}</news:publication_date>`);
    lines.push(`      <news:title>${escapeXml(article.title)}</news:title>`);
    lines.push('    </news:news>');
    lines.push('  </url>');
  }

  lines.push('</urlset>');
  return lines.join('\n');
}
