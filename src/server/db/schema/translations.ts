import {
  char,
  index,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const cmsTranslations = pgTable(
  'cms_translations',
  {
    id: serial('id').primaryKey(),
    hash: char('hash', { length: 64 }).notNull().unique(),
    langFrom: varchar('lang_from', { length: 10 }).notNull(),
    langTo: varchar('lang_to', { length: 10 }).notNull(),
    textOriginal: text('text_original').notNull(),
    textTranslated: text('text_translated').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('cms_translations_lang_to_idx').on(t.langTo),
    index('cms_translations_created_at_idx').on(t.createdAt),
  ]
);
