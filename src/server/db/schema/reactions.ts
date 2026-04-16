import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { user } from './auth';

// ─── cms_reactions ──────────────────────────────────────────────────────────────

export const cmsReactions = pgTable(
  'cms_reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    contentType: varchar('content_type', { length: 50 }).notNull(),
    contentId: uuid('content_id').notNull(),
    reactionType: varchar('reaction_type', { length: 10 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cms_reactions_user_content_uniq').on(t.userId, t.contentType, t.contentId),
    index('cms_reactions_content_idx').on(t.contentType, t.contentId),
  ]
);

export type CmsReaction = typeof cmsReactions.$inferSelect;
export type NewCmsReaction = typeof cmsReactions.$inferInsert;

