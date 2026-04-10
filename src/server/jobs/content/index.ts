import { and, eq, lte, isNull } from 'drizzle-orm';

import { createQueue, createWorker } from '@/core/lib/infra/queue';
import { db } from '@/server/db';
import { cmsPosts } from '@/server/db/schema/cms';
import { cmsCategories } from '@/server/db/schema/categories';
import { ContentStatus } from '@/core/types/cms';
import { logAudit } from '@/core/lib/audit';
import { dispatchWebhook } from '@/core/lib/webhooks/webhooks';

const _contentQueue = createQueue('content-publish');

export async function processScheduledContent(): Promise<void> {
  const now = new Date();

  // Publish scheduled posts
  const posts = await db
    .select({ id: cmsPosts.id, title: cmsPosts.title })
    .from(cmsPosts)
    .where(
      and(
        eq(cmsPosts.status, ContentStatus.SCHEDULED),
        lte(cmsPosts.publishedAt, now),
        isNull(cmsPosts.deletedAt)
      )
    );

  for (const post of posts) {
    await db
      .update(cmsPosts)
      .set({ status: ContentStatus.PUBLISHED })
      .where(eq(cmsPosts.id, post.id));

    logAudit({
      db,
      userId: 'system',
      action: 'publish',
      entityType: 'post',
      entityId: post.id,
      entityTitle: post.title,
      metadata: { auto: true },
    });

    dispatchWebhook(db, 'post.published', { id: post.id, title: post.title });
  }

  // Publish scheduled categories
  const cats = await db
    .select({ id: cmsCategories.id, name: cmsCategories.name })
    .from(cmsCategories)
    .where(
      and(
        eq(cmsCategories.status, ContentStatus.SCHEDULED),
        lte(cmsCategories.publishedAt, now),
        isNull(cmsCategories.deletedAt)
      )
    );

  for (const cat of cats) {
    await db
      .update(cmsCategories)
      .set({ status: ContentStatus.PUBLISHED })
      .where(eq(cmsCategories.id, cat.id));

    logAudit({
      db,
      userId: 'system',
      action: 'publish',
      entityType: 'category',
      entityId: cat.id,
      entityTitle: cat.name,
      metadata: { auto: true },
    });

    dispatchWebhook(db, 'category.published', {
      id: cat.id,
      name: cat.name,
    });
  }

  if (posts.length > 0 || cats.length > 0) {
    console.log(
      `[content] Auto-published ${posts.length} posts, ${cats.length} categories`
    );
  }
}

/** Initialize content publish worker (call from server.ts when BullMQ is enabled) */
export function startContentWorker(): void {
  createWorker('content-publish', async () => {
    await processScheduledContent();
  });
}
