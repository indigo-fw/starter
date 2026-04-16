import { inArray } from 'drizzle-orm';

import { createLogger } from '@/core/lib/infra/logger';
import { cmsPosts } from '@/server/db/schema';
import { user } from '@/server/db/schema';
import { Role } from '@/core/policy';
import { sendBulkNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { sectionProcedure } from '../../trpc';

export const logger = createLogger('cms-router');

export const contentProcedure = sectionProcedure('content');

export const POST_SNAPSHOT_KEYS = [
  'title',
  'slug',
  'content',
  'status',
  'metaDescription',
  'seoTitle',
  'featuredImage',
  'featuredImageAlt',
  'jsonLd',
  'noindex',
  'publishedAt',
  'lang',
] as const;

export const crudCols = {
  table: cmsPosts,
  id: cmsPosts.id,
  deleted_at: cmsPosts.deletedAt,
};

/** Notify staff users (editors, admins, superadmins) that content was published. Fire-and-forget. */
export function notifyContentPublished(
  dbInstance: typeof import('@/server/db').db,
  postTitle: string,
  postSlug: string,
  publisherId: string,
  contentType: { label: string; urlPrefix: string },
): void {
  const doNotify = async () => {
    try {
      const staffUsers = await dbInstance
        .select({ id: user.id })
        .from(user)
        .where(inArray(user.role, [Role.EDITOR, Role.ADMIN, Role.SUPERADMIN]))
        .limit(200);

      const recipientIds = staffUsers
        .map((u) => u.id)
        .filter((id) => id !== publisherId);

      if (recipientIds.length > 0) {
        sendBulkNotification(recipientIds, {
          title: `${contentType.label} published`,
          body: `"${postTitle}" has been published.`,
          type: NotificationType.INFO,
          category: NotificationCategory.CONTENT,
          actionUrl: `${contentType.urlPrefix}/${postSlug}`,
        });
      }
    } catch (err) {
      console.error('Failed to notify staff about published content:', err);
    }
  };
  doNotify();
}
