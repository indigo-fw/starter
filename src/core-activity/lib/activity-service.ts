import { db } from '@/server/db';
import { activityEvents } from '../schema/activity';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('activity');

export interface RecordActivityParams {
  actorId?: string;
  actorType?: 'user' | 'system';
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  metadata?: Record<string, unknown>;
  organizationId?: string;
  isPublic?: boolean;
}

/** Fire-and-forget activity recording. Never throws — logs errors via logger. */
export async function recordActivity(params: RecordActivityParams): Promise<void> {
  try {
    await db.insert(activityEvents).values({
      actorId: params.actorId ?? null,
      actorType: params.actorType ?? 'user',
      action: params.action,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      targetLabel: params.targetLabel ?? null,
      metadata: params.metadata ?? null,
      organizationId: params.organizationId ?? null,
      isPublic: params.isPublic ?? false,
    });
  } catch (err) {
    logger.error('Failed to record activity', { action: params.action, error: String(err) });
  }
}
