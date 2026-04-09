import {
  boolean,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ─── cms_categories ────────────────────────────────────────────────────────────

export const cmsCategories = pgTable(
  'cms_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    lang: varchar('lang', { length: 2 }).notNull().default('en'),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content').notNull().default(''),
    icon: varchar('icon', { length: 255 }),
    metaDescription: text('meta_description'),
    seoTitle: varchar('seo_title', { length: 255 }),
    order: smallint('order').notNull().default(0),
    status: smallint('status').notNull().default(0),
    publishedAt: timestamp('published_at'),
    noindex: boolean('noindex').notNull().default(false),
    fallbackToDefault: boolean('fallback_to_default'),
    translationGroup: uuid('translation_group'),
    jsonLd: text('json_ld'),
    previewToken: varchar('preview_token', { length: 64 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    uniqueIndex('cms_categories_slug_lang_uniq').on(t.slug, t.lang),
    index('cms_categories_status_order_idx').on(t.status, t.order),
    index('cms_categories_published_at_idx').on(t.publishedAt),
    index('cms_categories_deleted_at_idx').on(t.deletedAt),
    index('cms_categories_translation_group_idx').on(t.translationGroup),
  ]
);

export type CmsCategory = typeof cmsCategories.$inferSelect;
export type NewCmsCategory = typeof cmsCategories.$inferInsert;
