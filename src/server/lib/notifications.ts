import { db } from '@/server/db';
import { saasNotifications, member } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import type {
  NotificationType,
  NotificationCategory,
} from '@/core/types/notifications';

interface SendNotificationInput {
  userId: string;
  title: string;
  body: string;
  type?: NotificationType | string;
  category?: NotificationCategory | string;
  actionUrl?: string;
  orgId?: string;
}

/** Send notification to a single user. Fire-and-forget. */
export function sendNotification(input: SendNotificationInput): void {
  const doSend = async () => {
    try {
      const [notification] = await db
        .insert(saasNotifications)
        .values({
          userId: input.userId,
          title: input.title,
          body: input.body,
          type: input.type ?? 'info',
          category: input.category ?? 'system',
          actionUrl: input.actionUrl,
          orgId: input.orgId,
        })
        .returning();

      // Broadcast via WebSocket (if available)
      try {
        const { sendToUser } = await import('@/server/lib/ws');
        sendToUser(input.userId, 'notification', notification);
      } catch {
        // WS not available — notification still persisted in DB
      }

      // Send web push (if VAPID configured and user has subscriptions)
      try {
        const { sendPushToUser } = await import('@/core/lib/push/web-push');
        sendPushToUser(input.userId, {
          title: input.title,
          body: input.body,
          actionUrl: input.actionUrl,
          type: input.type as string,
          category: input.category as string,
        });
      } catch {
        // Push not available — notification still persisted in DB
      }
    } catch (err) {
      console.error('Failed to send notification:', err);
    }
  };

  doSend();
}

/** Send notification to all members of an org. Fire-and-forget. */
export function sendOrgNotification(
  orgId: string,
  input: Omit<SendNotificationInput, 'userId' | 'orgId'>
): void {
  const doSend = async () => {
    try {
      const members = await db
        .select({ userId: member.userId })
        .from(member)
        .where(eq(member.organizationId, orgId))
        .limit(200);

      for (const m of members) {
        sendNotification({ ...input, userId: m.userId, orgId });
      }
    } catch (err) {
      console.error('Failed to send org notification:', err);
    }
  };

  doSend();
}

/** Send notification to multiple users. Fire-and-forget. */
export function sendBulkNotification(
  userIds: string[],
  input: Omit<SendNotificationInput, 'userId'>
): void {
  for (const userId of userIds) {
    sendNotification({ ...input, userId });
  }
}
