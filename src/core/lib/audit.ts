import type { DbClient } from '@/server/db';
import { cmsAuditLog } from '@/server/db/schema/audit';
import { createLogger } from '@/core/lib/logger';

const log = createLogger('audit');

export interface LogAuditParams {
  db: DbClient;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  entityTitle?: string;
  metadata?: Record<string, unknown>;
}

/** Fire-and-forget audit log insert. Catches errors silently. */
export function logAudit(params: LogAuditParams): void {
  params.db
    .insert(cmsAuditLog)
    .values({
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      entityTitle: params.entityTitle ?? null,
      metadata: params.metadata ?? null,
    })
    .catch((err: unknown) => {
      log.error('Failed to write audit log', { action: params.action, entityType: params.entityType, error: String(err) });
    });
}
