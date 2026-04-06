import { pgTable, uuid, text, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { cmsWebhooks } from './webhooks';

export const cmsWebhookDeliveries = pgTable('cms_webhook_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  webhookId: uuid('webhook_id')
    .notNull()
    .references(() => cmsWebhooks.id, { onDelete: 'cascade' }),
  event: varchar('event', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(), // 'success' | 'failed'
  statusCode: integer('status_code'),
  error: text('error'),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('cms_webhook_deliveries_webhook_idx').on(t.webhookId, t.createdAt),
  index('cms_webhook_deliveries_status_idx').on(t.status),
]);
