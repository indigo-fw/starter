import { index, integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { chatCharacters } from './characters';

// ─── chat_conversations ─────────────────────────────────────────────────────
// A user's conversation with an AI character. Org-scoped for billing.

export const chatConversations = pgTable('chat_conversations', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  organizationId: text('organization_id').notNull(),
  characterId: text('character_id')
    .notNull()
    .references(() => chatCharacters.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  lastMessageAt: timestamp('last_message_at'),
  messageCount: integer('message_count').notNull().default(0),
  totalTokensUsed: integer('total_tokens_used').notNull().default(0),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_chat_conv_user_status').on(t.userId, t.status),
  index('idx_chat_conv_user_last_msg').on(t.userId, t.lastMessageAt),
  index('idx_chat_conv_character').on(t.characterId),
  index('idx_chat_conv_org').on(t.organizationId),
]);

export type ChatConversation = typeof chatConversations.$inferSelect;
export type NewChatConversation = typeof chatConversations.$inferInsert;
