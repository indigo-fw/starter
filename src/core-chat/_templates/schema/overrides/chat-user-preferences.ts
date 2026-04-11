/**
 * Project override for chat_user_preferences table.
 *
 * This file extends the module's base columns with project-specific fields.
 * The sync script detects this file and uses it instead of the module default.
 *
 * To use: copy this file to src/schema/overrides/chat-user-preferences.ts
 * Then run: bun run indigo:sync
 */
import { pgTable } from 'drizzle-orm/pg-core';
import { chatUserPreferenceColumns } from '@/core-chat/schema/user-preferences';

export const chatUserPreferences = pgTable('chat_user_preferences', {
  ...chatUserPreferenceColumns,
  // Add your project-specific columns below:
  // favoriteColor: varchar('favorite_color', { length: 50 }),
  // agePreference: varchar('age_preference', { length: 20 }),
});

export type ChatUserPreferences = typeof chatUserPreferences.$inferSelect;
