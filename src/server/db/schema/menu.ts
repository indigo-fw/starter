import {
  boolean,
  index,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ─── cms_menus ──────────────────────────────────────────────────────────────

export const cmsMenus = pgTable(
  'cms_menus',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('cms_menus_slug_uniq').on(t.slug)]
);

export type CmsMenu = typeof cmsMenus.$inferSelect;
export type NewCmsMenu = typeof cmsMenus.$inferInsert;

// ─── cms_menu_items ─────────────────────────────────────────────────────────

export const cmsMenuItems = pgTable(
  'cms_menu_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    menuId: uuid('menu_id')
      .notNull()
      .references(() => cmsMenus.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    label: varchar('label', { length: 255 }).notNull(),
    url: varchar('url', { length: 1024 }),
    contentType: varchar('content_type', { length: 30 }),
    contentId: uuid('content_id'),
    openInNewTab: boolean('open_in_new_tab').notNull().default(false),
    order: smallint('order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('cms_menu_items_menu_id_idx').on(t.menuId),
    index('cms_menu_items_parent_order_idx').on(t.menuId, t.parentId, t.order),
  ]
);

export type CmsMenuItem = typeof cmsMenuItems.$inferSelect;
export type NewCmsMenuItem = typeof cmsMenuItems.$inferInsert;
