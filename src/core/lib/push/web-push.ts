/**
 * Web Push notification service.
 *
 * Sends push notifications to all registered devices for a user.
 * Automatically cleans up expired subscriptions (410 Gone).
 * No-op if VAPID keys are not configured.
 */
import { eq } from 'drizzle-orm';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('web-push');

let webPushModule: typeof import('web-push') | null = null;
let initialized = false;

interface PushPayload {
  title: string;
  body: string;
  actionUrl?: string | null;
  type?: string;
  category?: string;
}

/** Lazy-initialize web-push with VAPID credentials. */
async function getWebPush(): Promise<typeof import('web-push') | null> {
  if (initialized) return webPushModule;
  initialized = true;

  const { env } = await import('@/lib/env');
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return null;
  }

  try {
    const wp = await import('web-push');
    wp.setVapidDetails(
      env.VAPID_SUBJECT ?? `mailto:admin@${new URL(env.NEXT_PUBLIC_APP_URL).hostname}`,
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY,
    );
    webPushModule = wp;
    logger.info('Web Push initialized with VAPID credentials');
    return wp;
  } catch (err) {
    logger.error('Failed to initialize web-push', { error: String(err) });
    return null;
  }
}

/** Check if push notifications are configured. */
export async function isPushEnabled(): Promise<boolean> {
  return (await getWebPush()) !== null;
}

/**
 * Send a push notification to all registered devices for a user.
 * Fire-and-forget — logs errors, never throws.
 * Automatically deletes subscriptions that return 410 Gone.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const wp = await getWebPush();
  if (!wp) return;

  const { db } = await import('@/server/db');
  const { saasPushSubscriptions } = await import('@/server/db/schema/push-subscriptions');

  const subscriptions = await db
    .select({
      id: saasPushSubscriptions.id,
      endpoint: saasPushSubscriptions.endpoint,
      p256dh: saasPushSubscriptions.p256dh,
      auth: saasPushSubscriptions.auth,
    })
    .from(saasPushSubscriptions)
    .where(eq(saasPushSubscriptions.userId, userId))
    .limit(20); // cap devices per user

  if (subscriptions.length === 0) return;

  const jsonPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    actionUrl: payload.actionUrl ?? null,
    type: payload.type ?? 'info',
    category: payload.category ?? 'system',
  });

  const staleIds: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await wp.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          jsonPayload,
          { TTL: 86400 }, // 24h
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          // Subscription expired or unsubscribed — mark for deletion
          staleIds.push(sub.id);
        } else {
          logger.warn('Push delivery failed', {
            subscriptionId: sub.id,
            statusCode,
            error: String(err),
          });
        }
      }
    }),
  );

  // Clean up stale subscriptions
  if (staleIds.length > 0) {
    const { inArray } = await import('drizzle-orm');
    await db
      .delete(saasPushSubscriptions)
      .where(inArray(saasPushSubscriptions.id, staleIds))
      .catch((err) => logger.error('Failed to cleanup stale push subscriptions', { error: String(err) }));
  }
}
