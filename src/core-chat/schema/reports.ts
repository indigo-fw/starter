import { index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ─── chat_reports ───────────────────────────────────────────────────────────
// User-submitted message/conversation reports for admin review.

export const chatReports = pgTable('chat_reports', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  reportedById: text('reported_by_id').notNull(),
  messageId: text('message_id'),
  conversationId: text('conversation_id'),
  text: text('text').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_chat_reports_status').on(t.status, t.createdAt),
  index('idx_chat_reports_user').on(t.reportedById),
]);

export type ChatReport = typeof chatReports.$inferSelect;
