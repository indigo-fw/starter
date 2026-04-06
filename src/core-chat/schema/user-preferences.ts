import { pgTable, smallint, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ─── chat_user_preferences ──────────────────────────────────────────────────
// Module-owned 1:1 satellite table for chat preferences.
//
// EXTENSIBLE: Project can override this table by creating
// src/schema/overrides/chat-user-preferences.ts that spreads these columns:
//
//   import { chatUserPreferenceColumns } from '@/core-chat/schema/user-preferences';
//   export const chatUserPreferences = pgTable('chat_user_preferences', {
//     ...chatUserPreferenceColumns,
//     favoriteColor: varchar('favorite_color', { length: 50 }),
//   });

/** Column definitions — spread these to extend the table in project overrides */
export const chatUserPreferenceColumns = {
  userId: text('user_id').primaryKey(),
  preferredName: varchar('preferred_name', { length: 100 }),
  preferredGender: smallint('preferred_gender'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
};

/** Default table — used when project doesn't override */
export const chatUserPreferences = pgTable('chat_user_preferences', chatUserPreferenceColumns);

export type ChatUserPreferences = typeof chatUserPreferences.$inferSelect;
