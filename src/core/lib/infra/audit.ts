import { createLogger } from '@/core/lib/infra/logger';
import type { DbClient } from '@/server/db';
import { cmsAuditLog } from '@/server/db/schema/audit';

const log = createLogger('audit');

/**
 * Actor id for jobs and webhooks that act without a signed-in user. The
 * `user_id` column is an FK to `user.id`, so this sentinel is stored as NULL
 * with `metadata.actor = 'system'` — inserting the literal would violate the FK
 * and silently drop the audit row.
 */
export const SYSTEM_ACTOR = 'system';

export interface LogAuditParams {
  db: DbClient;
  /** A user id, or `SYSTEM_ACTOR` for unattended jobs. */
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  entityTitle?: string;
  metadata?: Record<string, unknown>;
}

/** Fire-and-forget audit log insert. Catches errors silently. */
export function logAudit(params: LogAuditParams): void {
  const isSystem = params.userId === SYSTEM_ACTOR;
  const metadata = isSystem
    ? { ...(params.metadata ?? {}), actor: SYSTEM_ACTOR }
    : (params.metadata ?? null);
  params.db
    .insert(cmsAuditLog)
    .values({
      userId: isSystem ? null : params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      entityTitle: params.entityTitle ?? null,
      metadata,
    })
    .catch((err: unknown) => {
      log.error('Failed to write audit log', {
        action: params.action,
        entityType: params.entityType,
        error: String(err),
      });
    });
}
