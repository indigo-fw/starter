import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { count, eq, desc, and } from 'drizzle-orm';
import { activityEvents } from '../schema/activity';
import { cmsPosts } from '@/server/db/schema/cms';
import { PostType, ContentStatus } from '@/core/types/cms';

// ─── IDs (deterministic for idempotent seeding) ───────────────────────────

const EVT_01 = '00000000-0000-4000-c200-000000000001';
const EVT_02 = '00000000-0000-4000-c200-000000000002';
const EVT_03 = '00000000-0000-4000-c200-000000000003';
const EVT_04 = '00000000-0000-4000-c200-000000000004';
const EVT_05 = '00000000-0000-4000-c200-000000000005';
const EVT_06 = '00000000-0000-4000-c200-000000000006';
const EVT_07 = '00000000-0000-4000-c200-000000000007';
const EVT_08 = '00000000-0000-4000-c200-000000000008';
const EVT_09 = '00000000-0000-4000-c200-000000000009';
const EVT_10 = '00000000-0000-4000-c200-000000000010';
const EVT_11 = '00000000-0000-4000-c200-000000000011';
const EVT_12 = '00000000-0000-4000-c200-000000000012';

/**
 * Check if activity data already exists (skip seed if so).
 */
export async function hasActivityData(db: PostgresJsDatabase): Promise<boolean> {
  const [row] = await db.select({ count: count() }).from(activityEvents);
  return (row?.count ?? 0) > 0;
}

/** Helper: create a Date offset by N hours from now */
function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/**
 * Seed activity events with demo data. Uses real post titles from the DB.
 */
export async function seedActivity(
  db: PostgresJsDatabase,
  superadminUserId: string,
  context?: { userIds?: string[]; orgIds?: string[] },
): Promise<{ userIds?: string[]; orgIds?: string[] }> {
  // Grab real post titles for realistic activity
  const posts = await db
    .select({ id: cmsPosts.id, title: cmsPosts.title })
    .from(cmsPosts)
    .where(and(eq(cmsPosts.type, PostType.BLOG), eq(cmsPosts.status, ContentStatus.PUBLISHED)))
    .orderBy(desc(cmsPosts.createdAt))
    .limit(4);

  const postTitle = (i: number) => posts[i % posts.length]?.title ?? 'Untitled Post';
  const postId = (i: number) => posts[i % posts.length]?.id ?? undefined;

  // Use multiple actors if available
  const userIds = [superadminUserId, ...(context?.userIds?.slice(0, 2) ?? [])];
  const u = (i: number) => userIds[i % userIds.length]!;

  await db.insert(activityEvents).values([
    {
      id: EVT_01,
      actorId: u(0),
      actorType: 'user',
      action: 'post.published',
      targetType: 'post',
      targetId: postId(0),
      targetLabel: postTitle(0),
      isPublic: true,
      createdAt: hoursAgo(2),
    },
    {
      id: EVT_02,
      actorId: u(1),
      actorType: 'user',
      action: 'post.created',
      targetType: 'post',
      targetId: postId(1),
      targetLabel: postTitle(1),
      isPublic: false,
      createdAt: hoursAgo(5),
    },
    {
      id: EVT_03,
      actorId: u(2),
      actorType: 'user',
      action: 'comment.created',
      targetType: 'post',
      targetId: postId(0),
      targetLabel: postTitle(0),
      isPublic: true,
      createdAt: hoursAgo(8),
    },
    {
      id: EVT_04,
      actorId: null,
      actorType: 'system',
      action: 'user.registered',
      targetType: 'user',
      targetLabel: 'demo@example.com',
      isPublic: false,
      createdAt: hoursAgo(12),
    },
    {
      id: EVT_05,
      actorId: u(0),
      actorType: 'user',
      action: 'post.published',
      targetType: 'post',
      targetId: postId(2),
      targetLabel: postTitle(2),
      isPublic: true,
      createdAt: hoursAgo(24),
    },
    {
      id: EVT_06,
      actorId: u(1),
      actorType: 'user',
      action: 'order.placed',
      targetType: 'order',
      targetLabel: 'Order #INV-2026-00001',
      metadata: { totalCents: 2990, currency: 'EUR' },
      isPublic: false,
      createdAt: hoursAgo(36),
    },
    {
      id: EVT_07,
      actorId: u(2),
      actorType: 'user',
      action: 'comment.created',
      targetType: 'post',
      targetId: postId(3),
      targetLabel: postTitle(3),
      isPublic: true,
      createdAt: hoursAgo(48),
    },
    {
      id: EVT_08,
      actorId: null,
      actorType: 'system',
      action: 'user.registered',
      targetType: 'user',
      targetLabel: 'newuser@example.com',
      isPublic: false,
      createdAt: hoursAgo(72),
    },
    {
      id: EVT_09,
      actorId: u(0),
      actorType: 'user',
      action: 'post.updated',
      targetType: 'post',
      targetId: postId(0),
      targetLabel: postTitle(0),
      isPublic: false,
      createdAt: hoursAgo(96),
    },
    {
      id: EVT_10,
      actorId: u(1),
      actorType: 'user',
      action: 'post.published',
      targetType: 'page',
      targetLabel: 'About Us',
      isPublic: true,
      createdAt: hoursAgo(120),
    },
    {
      id: EVT_11,
      actorId: u(2),
      actorType: 'user',
      action: 'order.placed',
      targetType: 'order',
      targetLabel: 'Order #INV-2026-00002',
      metadata: { totalCents: 5990, currency: 'EUR' },
      isPublic: false,
      createdAt: hoursAgo(144),
    },
    {
      id: EVT_12,
      actorId: null,
      actorType: 'system',
      action: 'user.registered',
      targetType: 'user',
      targetLabel: 'jane@example.com',
      isPublic: false,
      createdAt: hoursAgo(168),
    },
  ]).onConflictDoNothing();

  return {};
}
