import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';

// ─── user preferences ───────────────────────────────────────────────────────
// Separate table to avoid Better Auth adapter conflicts with the user table.
// Stores per-user JSONB preferences (dashboard layout, column visibility, etc.)

export const cmsUserPreferences = pgTable('cms_user_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull().default({}),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type UserPreferences = typeof cmsUserPreferences.$inferSelect;
export type NewUserPreferences = typeof cmsUserPreferences.$inferInsert;
