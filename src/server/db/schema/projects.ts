import { index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { organization } from './organization';
import { user } from './auth';

// ─── saas_projects ───────────────────────────────────────────────────────────
// Example org-scoped feature — projects belong to an organization.

export const saasProjects = pgTable(
  'saas_projects',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 30 }).notNull().default('active'),
    createdById: text('created_by_id')
      .references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('saas_projects_org_idx').on(table.organizationId),
    index('saas_projects_deleted_idx').on(table.deletedAt),
  ],
);
