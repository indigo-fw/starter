import {
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ─── Comment status ────────────────────────────────────────────────────────

export const CommentStatus = {
  PENDING: 0,
  APPROVED: 1,
  REJECTED: 2,
  SPAM: 3,
} as const;

export type CommentStatusValue = (typeof CommentStatus)[keyof typeof CommentStatus];

// ─── cms_comments ──────────────────────────────────────────────────────────
// Polymorphic threaded comments — attach to any content type via targetType + targetId.

export const cmsComments = pgTable(
  'cms_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Content type this comment belongs to (e.g. 'post', 'showcase', 'doc', 'product') */
    targetType: varchar('target_type', { length: 50 }).notNull(),
    /** ID of the target content item */
    targetId: uuid('target_id').notNull(),
    /** Parent comment ID for threading (null = top-level) */
    parentId: uuid('parent_id'),
    /** User who posted the comment (null for guests if ever supported) */
    userId: uuid('user_id'),
    /** Display name override */
    authorName: varchar('author_name', { length: 100 }),
    /** Comment body */
    content: text('content').notNull(),
    /** 0=pending, 1=approved, 2=rejected, 3=spam */
    status: smallint('status').notNull().default(CommentStatus.APPROVED),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('idx_cms_comments_target_status').on(table.targetType, table.targetId, table.status),
    index('idx_cms_comments_parent').on(table.parentId),
    index('idx_cms_comments_user').on(table.userId),
    index('idx_cms_comments_status').on(table.status),
    index('idx_cms_comments_deleted').on(table.deletedAt),
  ],
);

export type Comment = typeof cmsComments.$inferSelect;
export type NewComment = typeof cmsComments.$inferInsert;
