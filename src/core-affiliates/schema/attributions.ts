import { index, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ─── saas_user_acquisitions ───────────────────────────────────────────────────────
// First-touch marketing attribution for each user.
// Captures HOW the user arrived (UTM, ref code, referrer, landing page).
// Separate from affiliate tracking — not every ref code is an affiliate partner.

export const saasUserAcquisitions = pgTable('saas_user_acquisitions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().unique(),

  // ── Typed columns for common filterable dimensions ──────────────────
  refCode: varchar('ref_code', { length: 255 }),
  utmSource: varchar('utm_source', { length: 255 }),
  utmMedium: varchar('utm_medium', { length: 255 }),
  utmCampaign: varchar('utm_campaign', { length: 500 }),

  // ── JSONB for less commonly filtered fields ─────────────────────────
  // { utm_term, utm_content, referrer, landing_page, ...custom params }
  extra: jsonb('extra').$type<Record<string, string>>(),

  capturedAt: timestamp('captured_at').notNull().defaultNow(),
}, (table) => [
  index('idx_user_acquisitions_utm_source').on(table.utmSource),
  index('idx_user_acquisitions_ref_code').on(table.refCode),
]);

export type UserAcquisition = typeof saasUserAcquisitions.$inferSelect;
export type NewUserAcquisition = typeof saasUserAcquisitions.$inferInsert;
