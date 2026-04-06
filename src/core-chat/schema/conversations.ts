import { index, integer, jsonb, pgTable, smallint, text, timestamp, varchar } from 'drizzle-orm/pg-core';
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
  lastReadMessageId: text('last_read_message_id'),
  lang: varchar('lang', { length: 10 }),
  langDetectedAt: timestamp('lang_detected_at'),
  // Per-conversation trait overrides (override character defaults)
  genderId: smallint('gender_id'),
  sexualityId: smallint('sexuality_id'),
  ethnicityId: smallint('ethnicity_id'),
  personalityId: smallint('personality_id'),
  kinkId: smallint('kink_id'),
  jobId: smallint('job_id'),
  hobbies: jsonb('hobbies').$type<number[] | null>(),
  relationshipId: smallint('relationship_id'),
  age: smallint('age'),
  userName: varchar('user_name', { length: 100 }),
  bornIn: varchar('born_in', { length: 255 }),
  livingIn: varchar('living_in', { length: 255 }),
  customTrait: varchar('custom_trait', { length: 255 }),
  conversationHash: varchar('conversation_hash', { length: 32 }),
  summarizationFailures: smallint('summarization_failures').notNull().default(0),
  lastSummarizationAt: timestamp('last_summarization_at'),
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
