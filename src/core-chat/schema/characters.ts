import { boolean, index, integer, jsonb, pgTable, real, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ─── chat_characters ────────────────────────────────────────────────────────
// AI personas that users can chat with. Admin-managed.

export const chatCharacters = pgTable('chat_characters', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  tagline: varchar('tagline', { length: 255 }),
  systemPrompt: text('system_prompt').notNull(),
  personality: text('personality'),
  avatarUrl: varchar('avatar_url', { length: 1024 }),
  greeting: text('greeting'),
  model: varchar('model', { length: 100 }),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  tokenCostMultiplier: real('token_cost_multiplier').notNull().default(1.0),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
}, (t) => [
  index('idx_chat_characters_active').on(t.isActive, t.sortOrder),
  index('idx_chat_characters_deleted').on(t.deletedAt),
]);

export type ChatCharacter = typeof chatCharacters.$inferSelect;
export type NewChatCharacter = typeof chatCharacters.$inferInsert;
