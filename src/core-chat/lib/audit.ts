import { eq, and, gte, count as drizzleCount } from 'drizzle-orm';
import { createLogger } from '@/core/lib/logger';
import { db } from '@/server/db';
import { chatAuditLog } from '@/core-chat/schema/audit';

const logger = createLogger('chat-audit');

const AUTO_BLOCK_THRESHOLD = 10;
const AUTO_BLOCK_WINDOW_HOURS = 24;

/**
 * Log a moderation/audit event. Fire-and-forget.
 */
export function logAuditEvent(
  userId: string,
  action: string,
  details?: { entityType?: string; entityId?: string; reason?: string; metadata?: string },
): void {
  db.insert(chatAuditLog).values({
    userId,
    action,
    entityType: details?.entityType,
    entityId: details?.entityId,
    reason: details?.reason,
    metadata: details?.metadata,
  }).catch((err) => {
    logger.error('Failed to log audit event', { error: err instanceof Error ? err.message : String(err) });
  });
}

/**
 * Check if a user should be auto-blocked based on recent violations.
 * Returns true if they've exceeded the threshold.
 */
export async function checkAutoBlock(userId: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - AUTO_BLOCK_WINDOW_HOURS * 60 * 60 * 1000);

  const [result] = await db
    .select({ count: drizzleCount() })
    .from(chatAuditLog)
    .where(and(
      eq(chatAuditLog.userId, userId),
      eq(chatAuditLog.action, 'content_moderated'),
      gte(chatAuditLog.createdAt, windowStart),
    ));

  const count = result?.count ?? 0;
  return count >= AUTO_BLOCK_THRESHOLD;
}
