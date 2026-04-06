import { index, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ─── saas_support_chat_sessions ──────────────────────────────────────────────
// Lightweight pre-ticket chat sessions. Most resolve via AI and never become tickets.

export const saasSupportChatSessions = pgTable('saas_support_chat_sessions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  visitorId: text('visitor_id').notNull(),
  userId: text('user_id'),
  email: varchar('email', { length: 255 }),
  status: varchar('status', { length: 30 }).notNull().default('ai_active'),
  ticketId: text('ticket_id'),
  subject: varchar('subject', { length: 255 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  closedAt: timestamp('closed_at'),
}, (table) => [
  index('idx_support_chat_sessions_visitor').on(table.visitorId),
  index('idx_support_chat_sessions_user').on(table.userId, table.status),
  index('idx_support_chat_sessions_status').on(table.status),
]);

// ─── saas_support_chat_messages ──────────────────────────────────────────────
// Messages within a chat session (user, AI, or human agent).

export const saasSupportChatMessages = pgTable('saas_support_chat_messages', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id')
    .notNull()
    .references(() => saasSupportChatSessions.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(),
  body: text('body').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_support_chat_messages_session').on(table.sessionId, table.createdAt),
]);
