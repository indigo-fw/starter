import { boolean, index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { user } from './auth';

export const saasNotifications = pgTable(
  'saas_notifications',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    orgId: text('org_id'),
    type: varchar('type', { length: 20 }).notNull().default('info'),
    category: varchar('category', { length: 30 }).notNull().default('system'),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    actionUrl: text('action_url'),
    read: boolean('read').notNull().default(false),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at'),
  },
  (t) => [
    index('saas_notifications_user_idx').on(t.userId, t.read, t.createdAt),
    index('saas_notifications_org_idx').on(t.orgId),
  ]
);
