import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { count, eq, desc, isNull, and } from 'drizzle-orm';

import { cmsComments, CommentStatus } from '../schema/comments';
import { cmsPosts } from '@/server/db/schema/cms';
import { cmsShowcase } from '@/server/db/schema/showcase';
import { PostType, ContentStatus } from '@/core/types/cms';

// ─── Deterministic IDs for idempotent seeding ────────────────────────────

const C01 = '00000000-0000-4000-c100-000000000001';
const C02 = '00000000-0000-4000-c100-000000000002';
const C03 = '00000000-0000-4000-c100-000000000003';
const C04 = '00000000-0000-4000-c100-000000000004';
const C05 = '00000000-0000-4000-c100-000000000005';
const C06 = '00000000-0000-4000-c100-000000000006';
const C07 = '00000000-0000-4000-c100-000000000007';
const C08 = '00000000-0000-4000-c100-000000000008';
const C09 = '00000000-0000-4000-c100-000000000009';
const C10 = '00000000-0000-4000-c100-000000000010';
const C11 = '00000000-0000-4000-c100-000000000011';
const C12 = '00000000-0000-4000-c100-000000000012';

/**
 * Check if comment data already exists (skip seed if so).
 */
export async function hasCommentsData(db: PostgresJsDatabase): Promise<boolean> {
  const [row] = await db.select({ count: count() }).from(cmsComments);
  return (row?.count ?? 0) > 0;
}

/**
 * Seed demo comments on blog posts and showcase items.
 */
export async function seedComments(
  db: PostgresJsDatabase,
  superadminUserId: string,
  context?: { userIds?: string[]; orgIds?: string[] },
): Promise<{ userIds?: string[]; orgIds?: string[] }> {
  // Grab up to 3 demo user IDs for varied authorship
  const userIds = [
    superadminUserId,
    ...(context?.userIds?.slice(0, 2) ?? []),
  ];
  const u = (i: number) => userIds[i % userIds.length]!;

  // ─── Find published blog posts ──────────────────────────────────────
  const blogPosts = await db
    .select({ id: cmsPosts.id })
    .from(cmsPosts)
    .where(and(eq(cmsPosts.type, PostType.BLOG), eq(cmsPosts.status, ContentStatus.PUBLISHED)))
    .orderBy(desc(cmsPosts.createdAt))
    .limit(2);

  if (blogPosts.length > 0) {
    const p1 = blogPosts[0]!.id;
    const p2 = (blogPosts[1] ?? blogPosts[0])!.id;

    // Top-level comments on post 1 — varied authors
    await db.insert(cmsComments).values([
      { id: C01, targetType: 'post', targetId: p1, userId: u(0), content: 'Great article! Really helped me understand the architecture decisions behind this approach.', status: CommentStatus.APPROVED },
      { id: C02, targetType: 'post', targetId: p1, userId: u(1), content: 'I have been looking for exactly this kind of walkthrough. The examples are clear and practical.', status: CommentStatus.APPROVED },
      { id: C03, targetType: 'post', targetId: p1, userId: u(2), content: 'Would love to see a follow-up post covering more advanced use cases.', status: CommentStatus.APPROVED },
    ]).onConflictDoNothing();

    // Threaded replies
    await db.insert(cmsComments).values([
      { id: C04, targetType: 'post', targetId: p1, parentId: C01, userId: u(1), content: 'Thanks! Glad you found it useful. The architecture section was the trickiest to explain.', status: CommentStatus.APPROVED },
      { id: C05, targetType: 'post', targetId: p1, parentId: C03, userId: u(0), content: 'That is a great suggestion — added to the content calendar.', status: CommentStatus.APPROVED },
    ]).onConflictDoNothing();

    // Comments on post 2
    await db.insert(cmsComments).values([
      { id: C06, targetType: 'post', targetId: p2, userId: u(2), content: 'This is exactly the approach we took in our last project. Solid recommendations.', status: CommentStatus.APPROVED },
      { id: C07, targetType: 'post', targetId: p2, userId: u(1), content: 'Nice post. One small correction — the API endpoint in section 3 should use POST, not GET.', status: CommentStatus.APPROVED },
      { id: C08, targetType: 'post', targetId: p2, parentId: C07, userId: u(0), content: 'Good catch, fixed! Thanks for pointing that out.', status: CommentStatus.APPROVED },
    ]).onConflictDoNothing();
  }

  // ─── Find published showcase items ──────────────────────────────────
  const showcaseItems = await db
    .select({ id: cmsShowcase.id })
    .from(cmsShowcase)
    .where(and(eq(cmsShowcase.status, ContentStatus.PUBLISHED), isNull(cmsShowcase.deletedAt)))
    .orderBy(desc(cmsShowcase.createdAt))
    .limit(2);

  if (showcaseItems.length > 0) {
    const s1 = showcaseItems[0]!.id;
    const s2 = (showcaseItems[1] ?? showcaseItems[0])!.id;

    await db.insert(cmsComments).values([
      { id: C09, targetType: 'showcase', targetId: s1, userId: u(1), content: 'Love the design on this one! The color palette is spot on.', status: CommentStatus.APPROVED },
      { id: C10, targetType: 'showcase', targetId: s1, userId: u(2), content: 'How long did this take to put together? Really impressive work.', status: CommentStatus.APPROVED },
      { id: C11, targetType: 'showcase', targetId: s1, parentId: C10, userId: u(0), content: 'About two weeks of iteration. The hardest part was getting the animations right.', status: CommentStatus.APPROVED },
      { id: C12, targetType: 'showcase', targetId: s2, userId: u(1), content: 'Clean execution. Would be great to see a behind-the-scenes breakdown.', status: CommentStatus.APPROVED },
    ]).onConflictDoNothing();
  }

  return {};
}
