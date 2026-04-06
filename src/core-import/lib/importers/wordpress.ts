import type { ImportResult, ImportedItem } from './types';

/**
 * Parse a WordPress WXR (XML) export file.
 * Uses regex extraction since WXR is well-structured — no external XML library needed.
 */
export function parseWordPressWXR(xml: string): ImportResult {
  const warnings: string[] = [];
  const items: ImportedItem[] = [];

  // Extract <item> elements
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const postType = extractTag(itemXml, 'wp:post_type');
    if (postType !== 'post' && postType !== 'page') continue;

    const title = extractTag(itemXml, 'title') ?? '';
    const slug = extractTag(itemXml, 'wp:post_name') ?? '';
    const content = extractCDATA(itemXml, 'content:encoded') ?? '';
    const status =
      extractTag(itemXml, 'wp:status') === 'publish' ? 'published' : 'draft';
    const pubDate = extractTag(itemXml, 'pubDate');

    // Extract categories and tags
    const categories: string[] = [];
    const tags: string[] = [];
    const catRegex =
      /<category domain="([^"]+)"[^>]*><!\[CDATA\[([^\]]+)\]\]><\/category>/g;
    let catMatch;
    while ((catMatch = catRegex.exec(itemXml)) !== null) {
      if (catMatch[1] === 'category') categories.push(catMatch[2]);
      else if (catMatch[1] === 'post_tag') tags.push(catMatch[2]);
    }

    // Extract meta description from wp:postmeta (Yoast / AIOSEO)
    let metaDescription = '';
    let seoTitle = '';
    const metaRegex =
      /<wp:postmeta>[\s\S]*?<wp:meta_key><!\[CDATA\[([^\]]+)\]\]><\/wp:meta_key>[\s\S]*?<wp:meta_value><!\[CDATA\[([\s\S]*?)\]\]><\/wp:meta_value>[\s\S]*?<\/wp:postmeta>/g;
    let metaMatch;
    while ((metaMatch = metaRegex.exec(itemXml)) !== null) {
      if (
        metaMatch[1] === '_yoast_wpseo_metadesc' ||
        metaMatch[1] === '_aioseop_description'
      ) {
        metaDescription = metaMatch[2];
      }
      if (
        metaMatch[1] === '_yoast_wpseo_title' ||
        metaMatch[1] === '_aioseop_title'
      ) {
        seoTitle = metaMatch[2];
      }
    }

    // Extract featured image from wp:postmeta
    let featuredImage: string | undefined;
    const attachmentRegex =
      /<wp:postmeta>[\s\S]*?<wp:meta_key><!\[CDATA\[_thumbnail_id\]\]><\/wp:meta_key>[\s\S]*?<\/wp:postmeta>/;
    if (attachmentRegex.test(itemXml)) {
      // Featured image references are attachment IDs — note as warning
      // The actual URL must be resolved from a separate <item> with that ID
    }

    items.push({
      title,
      slug:
        slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      content,
      status: status as 'draft' | 'published',
      publishedAt: pubDate ? new Date(pubDate) : undefined,
      categories,
      tags,
      metaDescription: metaDescription || undefined,
      seoTitle: seoTitle || undefined,
      featuredImage,
    });
  }

  if (items.length === 0) {
    warnings.push('No posts or pages found in the WXR file');
  }

  return { items, warnings };
}

function extractTag(xml: string, tag: string): string | undefined {
  // Escape special regex chars in tag name (for namespaced tags like wp:post_type)
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `<${escaped}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\\/${escaped}>`
  );
  const match = regex.exec(xml);
  return match?.[1] ?? match?.[2] ?? undefined;
}

function extractCDATA(xml: string, tag: string): string | undefined {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `<${escaped}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${escaped}>`
  );
  const match = regex.exec(xml);
  return match?.[1] ?? undefined;
}
