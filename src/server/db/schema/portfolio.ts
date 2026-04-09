import {
  boolean,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ─── cms_portfolio ─────────────────────────────────────────────────────────────

export const cmsPortfolio = pgTable(
  'cms_portfolio',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    lang: varchar('lang', { length: 2 }).notNull().default('en'),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content').notNull().default(''),
    status: smallint('status').notNull().default(0),
    publishedAt: timestamp('published_at'),
    metaDescription: text('meta_description'),
    seoTitle: varchar('seo_title', { length: 255 }),
    noindex: boolean('noindex').notNull().default(false),
    previewToken: varchar('preview_token', { length: 64 }),
    translationGroup: uuid('translation_group'),
    fallbackToDefault: boolean('fallback_to_default'),
    featuredImage: text('featured_image'),
    featuredImageAlt: varchar('featured_image_alt', { length: 255 }),

    // Portfolio-specific fields
    clientName: varchar('client_name', { length: 255 }),
    projectUrl: varchar('project_url', { length: 1024 }),
    techStack: jsonb('tech_stack').$type<string[]>().default([]),
    completedAt: timestamp('completed_at'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    uniqueIndex('cms_portfolio_slug_lang_uniq').on(t.slug, t.lang),
    index('cms_portfolio_status_idx').on(t.status),
    index('cms_portfolio_published_at_idx').on(t.publishedAt),
    index('cms_portfolio_deleted_at_idx').on(t.deletedAt),
    index('cms_portfolio_translation_group_idx').on(t.translationGroup),
  ]
);

export type CmsPortfolioItem = typeof cmsPortfolio.$inferSelect;
export type NewCmsPortfolioItem = typeof cmsPortfolio.$inferInsert;
