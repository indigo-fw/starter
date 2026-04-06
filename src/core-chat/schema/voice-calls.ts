import { boolean, index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ─── chat_voice_calls ───────────────────────────────────────────────────────
// Durable record of voice calls for billing and crash recovery.

export const chatVoiceCalls = pgTable('chat_voice_calls', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),
  conversationId: text('conversation_id').notNull(),
  characterId: text('character_id').notNull(),
  costPerMinute: integer('cost_per_minute').notNull(),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'),
  minutesBilled: integer('minutes_billed').notNull().default(0),
  tokensCharged: integer('tokens_charged').notNull().default(0),
  charged: boolean('charged').notNull().default(false),
}, (t) => [
  index('idx_chat_voice_calls_user').on(t.userId, t.startedAt),
  index('idx_chat_voice_calls_conv').on(t.conversationId),
  index('idx_chat_voice_calls_charged').on(t.charged),
]);

export type ChatVoiceCall = typeof chatVoiceCalls.$inferSelect;
