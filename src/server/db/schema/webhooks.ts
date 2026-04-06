import {
  boolean,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ─── cms_webhooks ───────────────────────────────────────────────────────────

export const cmsWebhooks = pgTable(
  'cms_webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    url: varchar('url', { length: 1024 }).notNull(),
    secret: varchar('secret', { length: 255 }).notNull(),
    events: jsonb('events').notNull().$type<string[]>(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('cms_webhooks_active_idx').on(t.active),
  ]
);

export type CmsWebhook = typeof cmsWebhooks.$inferSelect;
export type NewCmsWebhook = typeof cmsWebhooks.$inferInsert;
