import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { count, desc, eq } from 'drizzle-orm';

import { cmsAuthors, cmsAuthorRelationships } from '../schema/authors';
import { cmsPosts } from '@/server/db/schema/cms';
import { PostType } from '@/core/types/cms';

// ─── Deterministic IDs for idempotent seeding ────────────────────────────

const AUTHOR_1 = '00000000-0000-4000-a100-000000000001';
const AUTHOR_2 = '00000000-0000-4000-a100-000000000002';
const AUTHOR_3 = '00000000-0000-4000-a100-000000000003';

/**
 * Check if author data already exists (skip seed if so).
 */
export async function hasAuthorData(db: PostgresJsDatabase): Promise<boolean> {
  const [row] = await db.select({ count: count() }).from(cmsAuthors);
  return (row?.count ?? 0) > 0;
}

/**
 * Seed demo authors and link them to existing blog posts.
 */
export async function seedAuthors(
  db: PostgresJsDatabase,
  superadminUserId: string,
): Promise<{ userIds?: string[]; orgIds?: string[] }> {
  // ─── Authors ─────────────────────────────────────────────────────────
  await db.insert(cmsAuthors).values([
    {
      id: AUTHOR_1,
      userId: superadminUserId,
      name: 'Alex Rivera',
      slug: 'alex-rivera',
      bio: 'Lead developer and technical writer. Covers frameworks, architecture, and developer tooling.',
      socialUrls: JSON.stringify({ twitter: '@alexrivera', website: 'https://example.com' }),
    },
    {
      id: AUTHOR_2,
      name: 'Jordan Chen',
      slug: 'jordan-chen',
      bio: 'Product designer turned developer. Writes about UI/UX, design systems, and creative coding.',
      socialUrls: JSON.stringify({ github: 'https://github.com/jordanchen' }),
    },
    {
      id: AUTHOR_3,
      name: 'Sam Patel',
      slug: 'sam-patel',
      bio: 'DevOps engineer and open source contributor. Focuses on deployment, observability, and infrastructure.',
    },
  ]).onConflictDoNothing();

  // ─── Link authors to existing blog posts ─────────────────────────────
  const blogPosts = await db
    .select({ id: cmsPosts.id })
    .from(cmsPosts)
    .where(eq(cmsPosts.type, PostType.BLOG))
    .orderBy(desc(cmsPosts.createdAt))
    .limit(10);

  if (blogPosts.length > 0) {
    const authorIds = [AUTHOR_1, AUTHOR_2, AUTHOR_3];
    const relationships = blogPosts.flatMap((post, i) => {
      // Primary author rotates, some posts get a co-author
      const primary = authorIds[i % 3]!;
      const entries = [{ objectId: post.id, authorId: primary, contentType: 'blog', order: 0 }];
      // Every 3rd post gets a co-author
      if (i % 3 === 0 && blogPosts.length > 1) {
        const secondary = authorIds[(i + 1) % 3]!;
        entries.push({ objectId: post.id, authorId: secondary, contentType: 'blog', order: 1 });
      }
      return entries;
    });

    await db.insert(cmsAuthorRelationships).values(relationships).onConflictDoNothing();
  }

  return {};
}
