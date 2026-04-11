import { and, eq, lte, isNull } from 'drizzle-orm';

import { registerScheduledPublishTarget } from '@/core/lib/content/scheduled-publish';
import { db } from '@/server/db';
import { cmsPosts } from '@/server/db/schema/cms';
import { cmsCategories } from '@/server/db/schema/categories';
import { ContentStatus } from '@/core/types/cms';

// Re-export the core worker starter for backward compatibility
export { startContentPublishWorker as startContentWorker } from '@/core/lib/content/scheduled-publish';

// ---------------------------------------------------------------------------
// Register content types for scheduled publishing
// ---------------------------------------------------------------------------

registerScheduledPublishTarget({
  name: 'posts',
  entityType: 'post',
  webhookEventPrefix: 'post',

  findScheduled: () =>
    db
      .select({ id: cmsPosts.id, title: cmsPosts.title })
      .from(cmsPosts)
      .where(
        and(
          eq(cmsPosts.status, ContentStatus.SCHEDULED),
          lte(cmsPosts.publishedAt, new Date()),
          isNull(cmsPosts.deletedAt)
        )
      ),
  publish: (id) =>
    db.update(cmsPosts).set({ status: ContentStatus.PUBLISHED }).where(eq(cmsPosts.id, id)).then(() => {}),
});

registerScheduledPublishTarget({
  name: 'categories',
  entityType: 'category',
  webhookEventPrefix: 'category',

  findScheduled: () =>
    db
      .select({ id: cmsCategories.id, title: cmsCategories.name })
      .from(cmsCategories)
      .where(
        and(
          eq(cmsCategories.status, ContentStatus.SCHEDULED),
          lte(cmsCategories.publishedAt, new Date()),
          isNull(cmsCategories.deletedAt)
        )
      ),
  publish: (id) =>
    db.update(cmsCategories).set({ status: ContentStatus.PUBLISHED }).where(eq(cmsCategories.id, id)).then(() => {}),
});
