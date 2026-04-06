import { index, integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { chatConversations } from './conversations';

// ─── chat_messages ──────────────────────────────────────────────────────────
// Messages within a conversation. User messages use client-generated UUIDs
// for optimistic inserts; assistant messages use server-generated UUIDs.

export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => chatConversations.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('delivered'),
  moderationResult: jsonb('moderation_result'),
  tokenCount: integer('token_count'),
  mediaId: text('media_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_chat_msg_conv_created').on(t.conversationId, t.createdAt),
  index('idx_chat_msg_conv_role').on(t.conversationId, t.role),
]);

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

// ─── chat_conversation_summaries ────────────────────────────────────────────
// LLM-generated summaries of older messages to keep context window manageable.

export const chatConversationSummaries = pgTable('chat_conversation_summaries', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => chatConversations.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  messagesFrom: timestamp('messages_from').notNull(),
  messagesTo: timestamp('messages_to').notNull(),
  messagesCovered: integer('messages_covered').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_chat_summary_conv').on(t.conversationId, t.createdAt),
]);

export type ChatConversationSummary = typeof chatConversationSummaries.$inferSelect;
