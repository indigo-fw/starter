/**
 * Wire core-comments module dependencies to project-specific implementations.
 * Imported as a side-effect in server.ts.
 */
import { setCommentsDeps } from '@/core-comments/deps';
import { sendNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';

// Optional cross-module wiring: activity-feed entries for comment events.
// Computed specifier + guard — core-activity is independently removable, and
// this file belongs to core-comments, so a hard import would dangle.
let recordActivity:
  | ((entry: {
      actorId: string;
      action: string;
      targetType: string;
      targetId: string;
      isPublic?: boolean;
    }) => void)
  | null = null;
try {
  // module-manifest-ignore: core-activity
  const activityService = '@/core-activity/lib/activity-service';
  ({ recordActivity } = await import(activityService));
} catch {
  /* core-activity not installed */
}

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
    recordActivity?.({
      actorId: event.userId,
      action: 'comment.created',
      targetType: event.targetType,
      targetId: event.targetId,
      isPublic: true,
    });
  },

  onCommentDeleted(event) {
    recordActivity?.({
      actorId: event.userId,
      action: 'comment.deleted',
      targetType: event.targetType,
      targetId: event.targetId,
    });
  },
});
