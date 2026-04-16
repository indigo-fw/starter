import {
  boolean,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ─── activity_events ───────────────────────────────────────────────────────
// User-facing activity feed. Complements the internal audit log with
// public/org-scoped events that power timelines and activity streams.

export const activityEvents = pgTable(
  'activity_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Actor who performed the action (null for system events) */
    actorId: uuid('actor_id'),
    /** Type of actor */
    actorType: varchar('actor_type', { length: 20 }).notNull().default('user'),
    /** Dotted action identifier, e.g. 'comment.created', 'order.placed' */
    action: varchar('action', { length: 100 }).notNull(),
    /** Type of entity the action targets */
    targetType: varchar('target_type', { length: 50 }),
    /** ID of the target entity */
    targetId: uuid('target_id'),
    /** Human-readable label for the target, e.g. "My Blog Post" */
    targetLabel: varchar('target_label', { length: 255 }),
    /** Extra payload (free-form JSON) */
    metadata: jsonb('metadata'),
    /** Organization scope (null for global events) */
    organizationId: uuid('organization_id'),
    /** Whether this event is visible in the public feed */
    isPublic: boolean('is_public').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('activity_events_org_created_idx').on(t.organizationId, t.createdAt),
    index('activity_events_actor_created_idx').on(t.actorId, t.createdAt),
    index('activity_events_target_idx').on(t.targetType, t.targetId),
    index('activity_events_action_idx').on(t.action),
    index('activity_events_public_created_idx').on(t.isPublic, t.createdAt),
  ],
);

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type NewActivityEvent = typeof activityEvents.$inferInsert;
