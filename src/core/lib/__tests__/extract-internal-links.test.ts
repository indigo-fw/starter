import { describe, expect, it } from 'vitest';
import { extractInternalLinks } from '../markdown/extract-internal-links';

describe('extractInternalLinks', () => {
  it('extracts relative links from markdown', () => {
    const md = 'Check out [Privacy](/privacy-policy) and [Blog](/blog/my-post).';
    expect(extractInternalLinks(md)).toEqual(['/privacy-policy', '/blog/my-post']);
  });

  it('ignores external links', () => {
    const md = '[Google](https://google.com) and [Local](/about)';
    expect(extractInternalLinks(md)).toEqual(['/about']);
  });

  it('ignores protocol-relative links', () => {
    const md = '[CDN](//cdn.example.com/img.png)';
    expect(extractInternalLinks(md)).toEqual([]);
  });

  it('deduplicates URLs', () => {
    const md = '[A](/page) and [B](/page)';
    expect(extractInternalLinks(md)).toEqual(['/page']);
  });

  it('returns empty array for no links', () => {
    expect(extractInternalLinks('No links here.')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractInternalLinks('')).toEqual([]);
  });

  it('handles multiple links on same line', () => {
    const md = '[A](/a) [B](/b) [C](/c)';
    expect(extractInternalLinks(md)).toEqual(['/a', '/b', '/c']);
  });
});
