import { eq, desc, sql, count } from 'drizzle-orm';
import { createLogger } from '@/core/lib/logger';

const log = createLogger('webhook-delivery');

export interface WebhookDeliveryEntry {
  webhookId: string;
  event: string;
  status: 'success' | 'failed';
  statusCode?: number;
  error?: string;
  durationMs?: number;
}

/**
 * Log a webhook delivery attempt to the database. Fire-and-forget.
 */
export function logWebhookDelivery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  entry: WebhookDeliveryEntry,
): void {
  db.insert(table)
    .values({
      webhookId: entry.webhookId,
      event: entry.event,
      status: entry.status,
      statusCode: entry.statusCode ?? null,
      error: entry.error ?? null,
      durationMs: entry.durationMs ?? null,
    })
    .catch((err: unknown) => {
      log.error('Failed to log webhook delivery', { error: String(err) });
    });
}

/**
 * Get delivery stats for a webhook (last 24h success/fail counts + recent deliveries).
 */
export async function getDeliveryStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  webhookId: string,
): Promise<{
  total: number;
  success: number;
  failed: number;
  recent: Array<{
    id: string;
    event: string;
    status: string;
    statusCode: number | null;
    error: string | null;
    durationMs: number | null;
    createdAt: Date;
  }>;
}> {
  const t = table as unknown as Record<string, unknown>;

  const [counts] = await db
    .select({
      total: count(),
      success: sql<number>`count(*) filter (where ${t.status} = 'success')`,
      failed: sql<number>`count(*) filter (where ${t.status} = 'failed')`,
    })
    .from(table)
    .where(eq(t.webhookId as never, webhookId));

  const recent = await db
    .select()
    .from(table)
    .where(eq(t.webhookId as never, webhookId))
    .orderBy(desc(t.createdAt as never))
    .limit(20);

  return {
    total: counts?.total ?? 0,
    success: counts?.success ?? 0,
    failed: counts?.failed ?? 0,
    recent,
  };
}
