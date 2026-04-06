import { pgTable, smallint, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ─── chat_user_preferences ──────────────────────────────────────────────────
// Module-owned 1:1 satellite table for chat preferences.
// NOT on the core user table — keeps module self-contained.

export const chatUserPreferences = pgTable('chat_user_preferences', {
  userId: text('user_id').primaryKey(),
  preferredName: varchar('preferred_name', { length: 100 }),
  preferredGender: smallint('preferred_gender'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type ChatUserPreferences = typeof chatUserPreferences.$inferSelect;
