import { index, pgTable, primaryKey, smallint, text, uuid } from 'drizzle-orm/pg-core';

import { cmsPosts } from './cms';
import { user } from './auth';

// ─── cms_post_authors ───────────────────────────────────────────────────────���─
// Junction table for public/editorial authors on posts.
// Separate from cmsPosts.authorId which tracks the internal creator.

export const cmsPostAuthors = pgTable(
  'cms_post_authors',
  {
    postId: uuid('post_id')
      .notNull()
      .references(() => cmsPosts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Display order (0-based) */
    order: smallint('order').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId] }),
    index('cms_post_authors_post_id_idx').on(t.postId),
    index('cms_post_authors_user_id_idx').on(t.userId),
  ]
);

export type CmsPostAuthor = typeof cmsPostAuthors.$inferSelect;
export type NewCmsPostAuthor = typeof cmsPostAuthors.$inferInsert;
