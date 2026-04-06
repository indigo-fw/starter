import type { ImportResult, ImportedItem } from './types';

/**
 * Parse a Indigo JSON export file.
 * Expected format: `{ posts: [...], categories: [...], ... }`
 */
export function parseIndigoJSON(content: string): ImportResult {
  const warnings: string[] = [];

  let data: { posts?: Array<Record<string, unknown>> };
  try {
    data = JSON.parse(content);
  } catch {
    return { items: [], warnings: ['Invalid JSON format'] };
  }

  if (!data.posts || !Array.isArray(data.posts)) {
    return { items: [], warnings: ['No posts found in export data'] };
  }

  const items: ImportedItem[] = [];

  for (const post of data.posts) {
    if (!post.title || !post.slug) {
      warnings.push(`Skipping post without title or slug`);
      continue;
    }

    items.push({
      title: String(post.title),
      slug: String(post.slug),
      content: String(post.content ?? ''),
      status: post.status === 'published' ? 'published' : 'draft',
      publishedAt: post.publishedAt ? new Date(String(post.publishedAt)) : undefined,
      categories: Array.isArray(post.categories) ? post.categories.map(String) : undefined,
      tags: Array.isArray(post.tags) ? post.tags.map(String) : undefined,
      featuredImage: post.featuredImage ? String(post.featuredImage) : undefined,
      metaDescription: post.metaDescription ? String(post.metaDescription) : undefined,
      seoTitle: post.seoTitle ? String(post.seoTitle) : undefined,
    });
  }

  return { items, warnings };
}
