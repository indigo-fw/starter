import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { tsvector } from './types';

// ─── cms_posts ─────────────────────────────────────────────────────────────────

export const cmsPosts = pgTable(
  'cms_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: smallint('type').notNull(),
    status: smallint('status').notNull(),
    lang: varchar('lang', { length: 2 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content').notNull().default(''),
    metaDescription: text('meta_description'),
    seoTitle: varchar('seo_title', { length: 100 }),
    featuredImage: varchar('featured_image', { length: 1024 }),
    featuredImageAlt: varchar('featured_image_alt', { length: 500 }),
    jsonLd: text('json_ld'),
    noindex: boolean('noindex').notNull().default(false),
    publishedAt: timestamp('published_at'),
    previewToken: varchar('preview_token', { length: 64 }),
    translationGroup: uuid('translation_group'),
    fallbackToDefault: boolean('fallback_to_default'),
    parentId: uuid('parent_id'),
    authorId: text('author_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    searchVector: tsvector('search_vector'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    uniqueIndex('cms_posts_type_lang_slug_uniq').on(t.type, t.lang, t.slug),
    index('cms_posts_type_status_lang_idx').on(t.type, t.status, t.lang),
    index('cms_posts_slug_lang_idx').on(t.slug, t.lang),
    index('cms_posts_status_idx').on(t.status),
    index('cms_posts_published_at_idx').on(t.publishedAt),
    index('cms_posts_translation_group_idx').on(t.translationGroup),
    index('cms_posts_deleted_at_idx').on(t.deletedAt),
    index('cms_posts_author_id_idx').on(t.authorId),
    index('cms_posts_created_at_idx').on(t.createdAt),
    index('cms_posts_parent_id_idx').on(t.parentId),
    index('cms_posts_search_vector_idx').using('gin', t.searchVector),
  ]
);

export type CmsPost = typeof cmsPosts.$inferSelect;
export type NewCmsPost = typeof cmsPosts.$inferInsert;

// ─── cms_post_attachments ──────────────────────────────────────────────────────

export const cmsPostAttachments = pgTable(
  'cms_post_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id').references(() => cmsPosts.id, {
      onDelete: 'cascade',
    }),
    filename: varchar('filename', { length: 255 }).notNull(),
    filepath: varchar('filepath', { length: 1024 }).notNull(),
    fileType: smallint('file_type').notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: integer('file_size').notNull(),
    altText: varchar('alt_text', { length: 255 }),
    uploadedById: text('uploaded_by_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    index('cms_post_attachments_post_id_idx').on(t.postId),
    index('cms_post_attachments_file_type_idx').on(t.fileType),
    index('cms_post_attachments_deleted_at_idx').on(t.deletedAt),
  ]
);

export type CmsPostAttachment = typeof cmsPostAttachments.$inferSelect;
export type NewCmsPostAttachment = typeof cmsPostAttachments.$inferInsert;

// ─── cms_content_revisions ─────────────────────────────────────────────────────

export const cmsContentRevisions = pgTable(
  'cms_content_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentType: varchar('content_type', { length: 30 }).notNull(),
    contentId: uuid('content_id').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    createdBy: text('created_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('cms_content_revisions_type_id_idx').on(t.contentType, t.contentId),
  ]
);

export type CmsContentRevision = typeof cmsContentRevisions.$inferSelect;
export type NewCmsContentRevision = typeof cmsContentRevisions.$inferInsert;

// ─── cms_slug_redirects ────────────────────────────────────────────────────────

export const cmsSlugRedirects = pgTable(
  'cms_slug_redirects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    oldSlug: varchar('old_slug', { length: 255 }).notNull(),
    contentType: varchar('content_type', { length: 30 }).notNull(),
    contentId: uuid('content_id').notNull(),
    urlPrefix: varchar('url_prefix', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('cms_slug_redirects_lookup_idx').on(t.oldSlug, t.urlPrefix),
  ]
);

export type CmsSlugRedirect = typeof cmsSlugRedirects.$inferSelect;
export type NewCmsSlugRedirect = typeof cmsSlugRedirects.$inferInsert;

// ─── cms_options ───────────────────────────────────────────────────────────────

export const cmsOptions = pgTable('cms_options', {
  key: varchar('key', { length: 255 }).primaryKey(),
  value: jsonb('value'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type CmsOption = typeof cmsOptions.$inferSelect;
export type NewCmsOption = typeof cmsOptions.$inferInsert;
