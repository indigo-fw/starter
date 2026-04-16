/**
 * Wire core-comments module dependencies to project-specific implementations.
 * Imported as a side-effect in server.ts.
 */
import { setCommentsDeps } from '@/core-comments/deps';
import { sendNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';

setCommentsDeps({
  async sendNotification({ userId, title, body, url }) {
    sendNotification({
      userId,
      title,
      body,
      type: NotificationType.INFO,
      category: NotificationCategory.SYSTEM,
      actionUrl: url,
    });
  },
});
