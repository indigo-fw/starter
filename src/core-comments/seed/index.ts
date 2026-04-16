import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { count, eq, desc } from 'drizzle-orm';

import { cmsComments, CommentStatus } from '../schema/comments';
import { cmsPosts } from '@/server/db/schema/cms';
import { PostType } from '@/core/types/cms';

// ─── Deterministic IDs for idempotent seeding ────────────────────────────

const C1 = '00000000-0000-4000-c100-000000000001';
const C2 = '00000000-0000-4000-c100-000000000002';
const C3 = '00000000-0000-4000-c100-000000000003';
const C4 = '00000000-0000-4000-c100-000000000004';
const C5 = '00000000-0000-4000-c100-000000000005';
const C6 = '00000000-0000-4000-c100-000000000006';
const C7 = '00000000-0000-4000-c100-000000000007';
const C8 = '00000000-0000-4000-c100-000000000008';

/**
 * Check if comment data already exists (skip seed if so).
 */
export async function hasCommentsData(db: PostgresJsDatabase): Promise<boolean> {
  const [row] = await db.select({ count: count() }).from(cmsComments);
  return (row?.count ?? 0) > 0;
}

/**
 * Seed demo comments on existing blog posts.
 */
export async function seedComments(
  db: PostgresJsDatabase,
  superadminUserId: string,
): Promise<{ userIds?: string[]; orgIds?: string[] }> {
  // Find published blog posts to attach comments to
  const blogPosts = await db
    .select({ id: cmsPosts.id, title: cmsPosts.title })
    .from(cmsPosts)
    .where(eq(cmsPosts.type, PostType.BLOG))
    .orderBy(desc(cmsPosts.createdAt))
    .limit(2);

  if (blogPosts.length === 0) {
    return {};
  }

  const post1 = blogPosts[0]!;
  const post2 = blogPosts[1] ?? post1;

  // ─── Top-level comments on post 1 ───────────────────────────────────
  await db.insert(cmsComments).values([
    {
      id: C1,
      targetType: 'post',
      targetId: post1.id,
      userId: superadminUserId,
      content: 'Great article! Really helped me understand the architecture decisions behind this approach.',
      status: CommentStatus.APPROVED,
    },
    {
      id: C2,
      targetType: 'post',
      targetId: post1.id,
      userId: superadminUserId,
      content: 'I have been looking for exactly this kind of walkthrough. The examples are clear and practical.',
      status: CommentStatus.APPROVED,
    },
    {
      id: C3,
      targetType: 'post',
      targetId: post1.id,
      userId: superadminUserId,
      content: 'Would love to see a follow-up post covering more advanced use cases.',
      status: CommentStatus.APPROVED,
    },
  ]).onConflictDoNothing();

  // ─── Threaded replies on post 1 ─────────────────────────────────────
  await db.insert(cmsComments).values([
    {
      id: C4,
      targetType: 'post',
      targetId: post1.id,
      parentId: C1,
      userId: superadminUserId,
      content: 'Thanks! Glad you found it useful. The architecture section was the trickiest to explain.',
      status: CommentStatus.APPROVED,
    },
    {
      id: C5,
      targetType: 'post',
      targetId: post1.id,
      parentId: C3,
      userId: superadminUserId,
      content: 'That is a great suggestion. I will add it to the content calendar.',
      status: CommentStatus.APPROVED,
    },
  ]).onConflictDoNothing();

  // ─── Comments on post 2 ─────────────────────────────────────────────
  await db.insert(cmsComments).values([
    {
      id: C6,
      targetType: 'post',
      targetId: post2.id,
      userId: superadminUserId,
      content: 'This is exactly the approach we took in our last project. Solid recommendations here.',
      status: CommentStatus.APPROVED,
    },
    {
      id: C7,
      targetType: 'post',
      targetId: post2.id,
      userId: superadminUserId,
      content: 'Nice post. One small correction — the API endpoint in section 3 should use POST, not GET.',
      status: CommentStatus.APPROVED,
    },
    {
      id: C8,
      targetType: 'post',
      targetId: post2.id,
      parentId: C7,
      userId: superadminUserId,
      content: 'Good catch, fixed! Thanks for pointing that out.',
      status: CommentStatus.APPROVED,
    },
  ]).onConflictDoNothing();

  return {};
}
