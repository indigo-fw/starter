import {
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { user } from '@/server/db/schema/auth';

// ─── cms_authors ────────────────────────────────────────────────────────────
// Author profiles — decoupled from user accounts.
// A user can have multiple author personas across sites.

export const cmsAuthors = pgTable(
  'cms_authors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Link to user account (nullable for guest/external authors) */
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    bio: text('bio'),
    avatar: varchar('avatar', { length: 1024 }),
    /** Social URLs stored as JSON: { twitter, github, linkedin, website } */
    socialUrls: text('social_urls'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cms_authors_slug_uniq').on(t.slug),
    index('cms_authors_user_id_idx').on(t.userId),
  ]
);

export type CmsAuthor = typeof cmsAuthors.$inferSelect;
export type NewCmsAuthor = typeof cmsAuthors.$inferInsert;

// ─── cms_author_relationships ───────────────────────────────────────────────
// Polymorphic junction: any content type can have authors.
// contentType discriminator scopes queries (same pattern as cms_term_relationships).

export const cmsAuthorRelationships = pgTable(
  'cms_author_relationships',
  {
    objectId: uuid('object_id').notNull(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => cmsAuthors.id, { onDelete: 'cascade' }),
    contentType: varchar('content_type', { length: 50 }).notNull(),
    order: smallint('order').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.objectId, t.authorId, t.contentType] }),
    index('cms_author_rel_object_ct_idx').on(t.objectId, t.contentType),
    index('cms_author_rel_author_idx').on(t.authorId),
  ]
);

export type CmsAuthorRelationship = typeof cmsAuthorRelationships.$inferSelect;
export type NewCmsAuthorRelationship = typeof cmsAuthorRelationships.$inferInsert;
