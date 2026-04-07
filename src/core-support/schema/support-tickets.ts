import { boolean, index, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { organization } from '@/server/db/schema/organization';

// ─── saas_tickets ────────────────────────────────────────────────────────────
// Support tickets scoped to organizations.

export const saasTickets = pgTable('saas_tickets', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  subject: varchar('subject', { length: 255 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('open'),
  priority: varchar('priority', { length: 20 }).notNull().default('normal'),
  assignedTo: text('assigned_to'),
  source: varchar('source', { length: 20 }).notNull().default('form'),
  chatSessionId: text('chat_session_id'),
  satisfaction: varchar('satisfaction', { length: 20 }),
  satisfactionComment: text('satisfaction_comment'),
  closedAt: timestamp('closed_at'),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('idx_tickets_org_status').on(table.organizationId, table.status),
  index('idx_tickets_assigned').on(table.assignedTo, table.status),
  index('idx_tickets_created').on(table.createdAt),
]);

// ─── saas_ticket_messages ────────────────────────────────────────────────────
// Individual messages within a ticket thread.

export const saasTicketMessages = pgTable('saas_ticket_messages', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  ticketId: text('ticket_id')
    .notNull()
    .references(() => saasTickets.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  isStaff: boolean('is_staff').notNull().default(false),
  body: text('body').notNull(),
  attachments: jsonb('attachments'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_ticket_messages_ticket').on(table.ticketId, table.createdAt),
]);
