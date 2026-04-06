import type { ImportResult, ImportedItem } from './types';

/**
 * Parse a Ghost CMS JSON export file.
 * Supports both the `{ db: [{ data: ... }] }` format and flat `{ posts, tags, ... }`.
 */
export function parseGhostJSON(json: string): ImportResult {
  const warnings: string[] = [];
  const items: ImportedItem[] = [];

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(json) as Record<string, unknown>;
  } catch {
    warnings.push('Invalid JSON — could not parse Ghost export file');
    return { items, warnings };
  }

  // Ghost exports wrap data in db[0].data
  const dbArray = data.db as Array<{ data: Record<string, unknown> }> | undefined;
  const db = (dbArray?.[0]?.data ?? data) as Record<string, unknown>;

  const posts = (db.posts ?? []) as Array<Record<string, unknown>>;
  const postsTags = (db.posts_tags ?? []) as Array<{
    post_id: string;
    tag_id: string;
  }>;
  const tags = (db.tags ?? []) as Array<{ id: string; name: string }>;

  // Build tag lookup maps
  const tagMap = new Map(tags.map((t) => [t.id, t.name]));
  const postTagMap = new Map<string, string[]>();
  for (const pt of postsTags) {
    if (!postTagMap.has(pt.post_id)) postTagMap.set(pt.post_id, []);
    const tagName = tagMap.get(pt.tag_id);
    if (tagName) postTagMap.get(pt.post_id)!.push(tagName);
  }

  for (const post of posts) {
    const title = (post.title as string) ?? '';
    const slug = (post.slug as string) ?? '';
    const html = (post.html as string) ?? (post.plaintext as string) ?? '';
    const status =
      (post.status as string) === 'published' ? 'published' : 'draft';
    const publishedAt = post.published_at
      ? new Date(post.published_at as string)
      : undefined;
    const metaDescription = (post.meta_description as string) ?? '';
    const seoTitle = (post.meta_title as string) ?? '';
    const featuredImage = (post.feature_image as string) ?? undefined;
    const postId = post.id as string;

    items.push({
      title,
      slug:
        slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      content: html,
      status: status as 'draft' | 'published',
      publishedAt,
      tags: postTagMap.get(postId) ?? [],
      metaDescription: metaDescription || undefined,
      seoTitle: seoTitle || undefined,
      featuredImage: featuredImage || undefined,
    });
  }

  if (items.length === 0) {
    warnings.push('No posts found in Ghost export');
  }

  return { items, warnings };
}
