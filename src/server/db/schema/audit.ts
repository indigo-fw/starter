import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { user } from './auth';

// ─── cms_audit_log ──────────────────────────────────────────────────────────

export const cmsAuditLog = pgTable(
  'cms_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    action: varchar('action', { length: 30 }).notNull(),
    entityType: varchar('entity_type', { length: 30 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    entityTitle: varchar('entity_title', { length: 255 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('cms_audit_log_entity_idx').on(t.entityType, t.entityId),
    index('cms_audit_log_user_idx').on(t.userId),
    index('cms_audit_log_action_idx').on(t.action),
    index('cms_audit_log_created_at_idx').on(t.createdAt),
  ]
);

export type CmsAuditLogEntry = typeof cmsAuditLog.$inferSelect;
export type NewCmsAuditLogEntry = typeof cmsAuditLog.$inferInsert;
