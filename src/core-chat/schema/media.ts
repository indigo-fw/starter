import { index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ─── chat_media ─────────────────────────────────────────────────────────────
// Media files for chat: user-uploaded attachments and character avatars.
// Deliberately separate from CMS media (no SEO fields, simpler structure).

export const chatMedia = pgTable('chat_media', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id'),
  filename: varchar('filename', { length: 255 }).notNull(),
  filepath: varchar('filepath', { length: 1024 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  fileSize: integer('file_size').notNull(),
  width: integer('width'),
  height: integer('height'),
  thumbnailPath: varchar('thumbnail_path', { length: 1024 }),
  purpose: varchar('purpose', { length: 30 }).notNull().default('message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_chat_media_user').on(t.userId),
  index('idx_chat_media_purpose').on(t.purpose),
]);

export type ChatMediaRecord = typeof chatMedia.$inferSelect;
