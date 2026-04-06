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

// ─── cms_showcase ───────────────────────────────────────────────────────────────

export const cmsShowcase = pgTable(
  'cms_showcase',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    lang: varchar('lang', { length: 2 }).notNull().default('en'),
    description: text('description').notNull().default(''),
    cardType: varchar('card_type', { length: 20 }).notNull().default('richtext'),
    mediaUrl: text('media_url'),
    thumbnailUrl: text('thumbnail_url'),
    status: smallint('status').notNull().default(0),
    sortOrder: smallint('sort_order').notNull().default(0),
    publishedAt: timestamp('published_at'),
    metaDescription: text('meta_description'),
    seoTitle: varchar('seo_title', { length: 255 }),
    noindex: boolean('noindex').notNull().default(false),
    previewToken: varchar('preview_token', { length: 64 }),
    translationGroup: uuid('translation_group'),
    fallbackToDefault: boolean('fallback_to_default'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    uniqueIndex('cms_showcase_slug_lang_uniq').on(t.slug, t.lang),
    index('cms_showcase_status_idx').on(t.status),
    index('cms_showcase_sort_order_idx').on(t.sortOrder),
    index('cms_showcase_deleted_at_idx').on(t.deletedAt),
    index('cms_showcase_translation_group_idx').on(t.translationGroup),
  ]
);

export type CmsShowcaseItem = typeof cmsShowcase.$inferSelect;
export type NewCmsShowcaseItem = typeof cmsShowcase.$inferInsert;
