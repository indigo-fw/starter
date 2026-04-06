import { index, integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ─── chat_providers ─────────────────────────────────────────────────────────
// AI provider configurations. Credentials encrypted at rest with ENCRYPTION_KEY.
// Managed by superadmin/admin in the dashboard.

export const chatProviders = pgTable('chat_providers', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: varchar('name', { length: 100 }).notNull(),
  adapterType: varchar('adapter_type', { length: 20 }).notNull().default('openai'),
  baseUrl: varchar('base_url', { length: 500 }),
  encryptedApiKey: text('encrypted_api_key').notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  priority: integer('priority').notNull().default(0),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  maxConcurrent: integer('max_concurrent').notNull().default(10),
  timeoutSeconds: integer('timeout_seconds').notNull().default(60),
  config: jsonb('config'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_chat_providers_status_priority').on(t.status, t.priority),
]);

export type ChatProvider = typeof chatProviders.$inferSelect;
export type NewChatProvider = typeof chatProviders.$inferInsert;
