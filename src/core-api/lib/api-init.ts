/**
 * Module-level initialization for core-api.
 * Registers maintenance tasks.
 * Imported as a side-effect via serverInit.
 */
import { and, inArray, lte, isNotNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { registerMaintenanceTask } from '@/core/lib/infra/maintenance';
import { createLogger } from '@/core/lib/infra/logger';
import { saasApiKeys, saasApiRequestLogs } from '@/core-api/schema/api-keys';

const log = createLogger('api-maintenance');

const LOG_RETENTION_DAYS = 90;

/** Purge API request logs older than 90 days. */
async function cleanupOldApiRequestLogs(): Promise<void> {
  const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const result = await db
    .delete(saasApiRequestLogs)
    .where(lte(saasApiRequestLogs.createdAt, cutoff));

  const count = (result as unknown as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) {
    log.info(`Cleaned up ${count} API request logs older than ${LOG_RETENTION_DAYS} days`);
  }
}

/** Set status='expired' on keys past their expiresAt. */
async function expireOldApiKeys(): Promise<void> {
  const now = new Date();

  const result = await db
    .update(saasApiKeys)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        inArray(saasApiKeys.status, ['active', 'expiring']),
        isNotNull(saasApiKeys.expiresAt),
        lte(saasApiKeys.expiresAt, now),
      ),
    );

  const count = (result as unknown as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) {
    log.info(`Expired ${count} API keys past their expiresAt`);
  }
}

registerMaintenanceTask('cleanupOldApiRequestLogs', cleanupOldApiRequestLogs);
registerMaintenanceTask('expireOldApiKeys', expireOldApiKeys);
