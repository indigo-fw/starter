/**
 * Wire core-comments module dependencies to project-specific implementations.
 * Imported as a side-effect in server.ts.
 */
import { setCommentsDeps } from '@/core-comments/deps';
import { sendNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { recordActivity } from '@/core-activity/lib/activity-service';

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

  onCommentCreated(event) {
    recordActivity({
      actorId: event.userId,
      action: 'comment.created',
      targetType: event.targetType,
      targetId: event.targetId,
      isPublic: true,
    });
  },

  onCommentDeleted(event) {
    recordActivity({
      actorId: event.userId,
      action: 'comment.deleted',
      targetType: event.targetType,
      targetId: event.targetId,
    });
  },
});
