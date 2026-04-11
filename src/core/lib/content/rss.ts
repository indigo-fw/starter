/**
 * RSS 2.0 feed builder — generates XML from a config + items array.
 * Used by project-layer route handlers that provide the DB queries.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RssFeedConfig {
  /** Channel title (e.g. "Blog | My Site") */
  title: string;
  /** Channel link (absolute URL to the HTML page) */
  link: string;
  /** Channel description */
  description: string;
  /** ISO 639-1 language code */
  language: string;
  /** Self-referencing feed URL (for atom:link) */
  feedUrl: string;
}

export interface RssFeedItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape special XML characters in a string. */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/** Build an RSS 2.0 XML string from a channel config and item list. */
export function generateRssFeed(
  config: RssFeedConfig,
  items: RssFeedItem[],
): string {
  const itemsXml = items
    .map((item) => {
      const pubDate = item.pubDate ? new Date(item.pubDate).toUTCString() : '';
      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
      ${item.description ? `<description>${escapeXml(item.description)}</description>` : ''}
      ${pubDate ? `<pubDate>${pubDate}</pubDate>` : ''}
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(config.title)}</title>
    <link>${escapeXml(config.link)}</link>
    <description>${escapeXml(config.description)}</description>
    <language>${config.language}</language>
    <atom:link href="${escapeXml(config.feedUrl)}" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>`;
}

/** Wrap RSS XML in a Response with correct content-type and caching headers. */
export function createRssResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=600',
    },
  });
}
