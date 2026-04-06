import {
  index,
  jsonb,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ─── cms_custom_field_definitions ──────────────────────────────────────────────

export const cmsCustomFieldDefinitions = pgTable(
  'cms_custom_field_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    fieldType: varchar('field_type', { length: 30 }).notNull(),
    options: jsonb('options'),
    contentTypes: jsonb('content_types').notNull(),
    sortOrder: smallint('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
);

export type CmsCustomFieldDefinition = typeof cmsCustomFieldDefinitions.$inferSelect;
export type NewCmsCustomFieldDefinition = typeof cmsCustomFieldDefinitions.$inferInsert;

// ─── cms_custom_field_values ───────────────────────────────────────────────────

export const cmsCustomFieldValues = pgTable(
  'cms_custom_field_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fieldDefinitionId: uuid('field_definition_id')
      .notNull()
      .references(() => cmsCustomFieldDefinitions.id, { onDelete: 'cascade' }),
    contentType: varchar('content_type', { length: 30 }).notNull(),
    contentId: uuid('content_id').notNull(),
    value: jsonb('value'),
  },
  (t) => [
    index('cms_cfv_content_idx').on(t.contentType, t.contentId),
    index('cms_cfv_definition_idx').on(t.fieldDefinitionId),
    uniqueIndex('cms_cfv_unique_idx').on(
      t.fieldDefinitionId,
      t.contentType,
      t.contentId,
    ),
  ],
);

export type CmsCustomFieldValue = typeof cmsCustomFieldValues.$inferSelect;
export type NewCmsCustomFieldValue = typeof cmsCustomFieldValues.$inferInsert;
