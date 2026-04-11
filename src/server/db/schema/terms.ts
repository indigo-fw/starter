import { DEFAULT_LOCALE } from '@/lib/constants';
import {
  index,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ─── cms_terms ─────────────────────────────────────────────────────────────────
// Universal terms table for tag-like taxonomies.
// Categories keep their own rich table (cms_categories); only simple taxonomies live here.

export const cmsTerms = pgTable(
  'cms_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taxonomyId: varchar('taxonomy_id', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    lang: varchar('lang', { length: 2 }).notNull().default(DEFAULT_LOCALE),
    status: smallint('status').notNull().default(1), // default published
    order: smallint('order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    uniqueIndex('cms_terms_taxonomy_slug_lang_uniq').on(
      t.taxonomyId,
      t.slug,
      t.lang
    ),
    index('cms_terms_taxonomy_id_idx').on(t.taxonomyId),
    index('cms_terms_deleted_at_idx').on(t.deletedAt),
    index('cms_terms_status_order_idx').on(t.status, t.order),
  ]
);

export type CmsTerm = typeof cmsTerms.$inferSelect;
export type NewCmsTerm = typeof cmsTerms.$inferInsert;
