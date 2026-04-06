import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ─── cms_forms ─────────────────────────────────────────────────────────────────

export const cmsForms = pgTable('cms_forms', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  fields: jsonb('fields').notNull(),
  recipientEmail: varchar('recipient_email', { length: 255 }),
  successMessage: text('success_message').default('Thank you!'),
  honeypotField: varchar('honeypot_field', { length: 50 }),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type CmsForm = typeof cmsForms.$inferSelect;
export type NewCmsForm = typeof cmsForms.$inferInsert;

// ─── cms_form_submissions ──────────────────────────────────────────────────────

export const cmsFormSubmissions = pgTable(
  'cms_form_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    formId: uuid('form_id')
      .notNull()
      .references(() => cmsForms.id, { onDelete: 'cascade' }),
    data: jsonb('data').notNull(),
    ip: varchar('ip', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('cms_form_submissions_form_created_idx').on(t.formId, t.createdAt),
  ],
);

export type CmsFormSubmission = typeof cmsFormSubmissions.$inferSelect;
export type NewCmsFormSubmission = typeof cmsFormSubmissions.$inferInsert;
