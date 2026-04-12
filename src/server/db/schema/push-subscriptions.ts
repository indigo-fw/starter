import { index, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { user } from './auth';

// ─── saas_push_subscriptions ────────────────────────────────────────────────
// Web Push API subscriptions per user. One user may have multiple devices.

export const saasPushSubscriptions = pgTable(
  'saas_push_subscriptions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Push API endpoint URL (unique per browser/device). */
    endpoint: text('endpoint').notNull(),
    /** VAPID p256dh public key from the browser. */
    p256dh: text('p256dh').notNull(),
    /** VAPID auth secret from the browser. */
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    /** Refreshed on each re-subscribe. Used to detect stale subscriptions. */
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('saas_push_subs_user_idx').on(t.userId),
    unique('saas_push_subs_endpoint_uniq').on(t.endpoint),
  ],
);
