import { index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ─── chat_audit_log ─────────────────────────────────────────────────────────
// Tracks moderation events for auto-blocking and admin review.

export const chatAuditLog = pgTable('chat_audit_log', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  action: varchar('action', { length: 50 }).notNull(),
  entityType: varchar('entity_type', { length: 30 }),
  entityId: text('entity_id'),
  reason: text('reason'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_chat_audit_user').on(t.userId, t.createdAt),
  index('idx_chat_audit_action').on(t.action, t.createdAt),
]);

export type ChatAuditLogEntry = typeof chatAuditLog.$inferSelect;
