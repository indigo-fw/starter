import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';

// ─── organization ─────────────────────────────────────────────────────────────
// Better Auth organization plugin tables. Text PKs (Better Auth convention).

export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: text('metadata'), // JSON string
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at'),
});

// ─── member ───────────────────────────────────────────────────────────────────

export const member = pgTable('member', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─── invitation ───────────────────────────────────────────────────────────────

export const invitation = pgTable('invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').default('member'),
  status: text('status').notNull().default('pending'),
  inviterId: text('inviter_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
