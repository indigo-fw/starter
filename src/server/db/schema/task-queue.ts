import { index, integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const saasTaskQueue = pgTable('saas_task_queue', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  queue: varchar('queue', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  priority: integer('priority').notNull().default(0),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  runAfter: timestamp('run_after').notNull().defaultNow(),
  lockedUntil: timestamp('locked_until'),
  lastError: text('last_error'),
  result: jsonb('result'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('idx_task_queue_poll').on(table.queue, table.status, table.runAfter),
  index('idx_task_queue_stale').on(table.status, table.lockedUntil),
]);
