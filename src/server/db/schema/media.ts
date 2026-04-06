import {
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { user } from './auth';

// ─── cms_media ─────────────────────────────────────────────────────────────────

export const cmsMedia = pgTable(
  'cms_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    filename: varchar('filename', { length: 255 }).notNull(),
    filepath: varchar('filepath', { length: 1024 }).notNull(),
    fileType: smallint('file_type').notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: integer('file_size').notNull(),
    title: varchar('title', { length: 255 }),
    altText: varchar('alt_text', { length: 255 }),
    description: text('description'),
    width: integer('width'),
    height: integer('height'),
    thumbnailPath: varchar('thumbnail_path', { length: 1024 }),
    mediumPath: varchar('medium_path', { length: 1024 }),
    blurDataUrl: text('blur_data_url'),
    uploadedById: text('uploaded_by_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    index('cms_media_file_type_idx').on(t.fileType),
    index('cms_media_uploaded_by_id_idx').on(t.uploadedById),
    index('cms_media_deleted_at_idx').on(t.deletedAt),
    index('cms_media_created_at_idx').on(t.createdAt),
  ]
);

export type CmsMediaRecord = typeof cmsMedia.$inferSelect;
export type NewCmsMediaRecord = typeof cmsMedia.$inferInsert;
