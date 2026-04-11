import { describe, it, expect } from 'vitest';
import { escapeXml, generateRssFeed, createRssResponse } from '../content/rss';

describe('escapeXml', () => {
  it('escapes all XML special characters', () => {
    expect(escapeXml('a & b < c > d " e \' f')).toBe(
      'a &amp; b &lt; c &gt; d &quot; e &apos; f',
    );
  });

  it('returns empty string unchanged', () => {
    expect(escapeXml('')).toBe('');
  });

  it('returns safe string unchanged', () => {
    expect(escapeXml('hello world')).toBe('hello world');
  });
});

describe('generateRssFeed', () => {
  const config = {
    title: 'Blog | Test',
    link: 'https://example.com/blog',
    description: 'A test blog',
    language: 'en',
    feedUrl: 'https://example.com/api/feed/blog',
  };

  it('generates valid RSS 2.0 XML', () => {
    const xml = generateRssFeed(config, []);

    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(xml).toContain('<channel>');
    expect(xml).toContain('</channel>');
    expect(xml).toContain('</rss>');
  });

  it('includes channel metadata', () => {
    const xml = generateRssFeed(config, []);

    expect(xml).toContain('<title>Blog | Test</title>');
    expect(xml).toContain('<link>https://example.com/blog</link>');
    expect(xml).toContain('<description>A test blog</description>');
    expect(xml).toContain('<language>en</language>');
    expect(xml).toContain('rel="self"');
  });

  it('renders items with all fields', () => {
    const xml = generateRssFeed(config, [
      {
        title: 'Post One',
        link: 'https://example.com/blog/post-one',
        description: 'First post',
        pubDate: new Date('2025-01-15T12:00:00Z'),
      },
    ]);

    expect(xml).toContain('<title>Post One</title>');
    expect(xml).toContain('<link>https://example.com/blog/post-one</link>');
    expect(xml).toContain('<guid isPermaLink="true">https://example.com/blog/post-one</guid>');
    expect(xml).toContain('<description>First post</description>');
    expect(xml).toContain('<pubDate>');
  });

  it('omits optional fields when not provided', () => {
    const xml = generateRssFeed(config, [
      { title: 'No desc', link: 'https://example.com/x' },
    ]);

    // Channel has <description> but item should not
    const itemXml = xml.split('<item>')[1].split('</item>')[0];
    expect(itemXml).not.toContain('<description>');
    expect(itemXml).not.toContain('<pubDate>');
  });

  it('escapes special characters in items', () => {
    const xml = generateRssFeed(config, [
      { title: 'A & B', link: 'https://example.com/a&b' },
    ]);

    expect(xml).toContain('A &amp; B');
    expect(xml).toContain('https://example.com/a&amp;b');
  });

  it('renders multiple items', () => {
    const xml = generateRssFeed(config, [
      { title: 'One', link: 'https://example.com/1' },
      { title: 'Two', link: 'https://example.com/2' },
      { title: 'Three', link: 'https://example.com/3' },
    ]);

    expect(xml.match(/<item>/g)).toHaveLength(3);
  });
});

describe('createRssResponse', () => {
  it('returns Response with correct content-type', () => {
    const res = createRssResponse('<rss />');

    expect(res.headers.get('Content-Type')).toBe('application/rss+xml; charset=utf-8');
  });

  it('sets cache headers', () => {
    const res = createRssResponse('<rss />');

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=600, s-maxage=600');
  });
});
