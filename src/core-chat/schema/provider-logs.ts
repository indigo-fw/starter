import { index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { chatProviders } from './providers';

// ─── chat_provider_logs ─────────────────────────────────────────────────────
// Lightweight request logs for provider health monitoring.
// One row per provider request (success or failure).

export const chatProviderLogs = pgTable('chat_provider_logs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  providerId: text('provider_id').notNull()
    .references(() => chatProviders.id, { onDelete: 'cascade' }),
  providerType: varchar('provider_type', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  responseTimeMs: integer('response_time_ms'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_chat_provider_logs_provider').on(t.providerId, t.createdAt),
  index('idx_chat_provider_logs_created').on(t.createdAt),
]);

export type ChatProviderLog = typeof chatProviderLogs.$inferSelect;
