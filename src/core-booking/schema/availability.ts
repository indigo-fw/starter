import { boolean, index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { bookingServices } from './services';

// ─── Recurring schedules (weekly pattern) ──────────────────────────────────

export const bookingSchedules = pgTable('booking_schedules', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  serviceId: text('service_id').notNull().references(() => bookingServices.id, { onDelete: 'cascade' }),
  /** Day of week: 0 = Sunday, 1 = Monday, ... 6 = Saturday */
  dayOfWeek: integer('day_of_week').notNull(),
  /** Start time in HH:MM format (24h, e.g. "09:00") */
  startTime: varchar('start_time', { length: 5 }).notNull(),
  /** End time in HH:MM format (24h, e.g. "17:00") */
  endTime: varchar('end_time', { length: 5 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_booking_schedules_service').on(table.serviceId),
  index('idx_booking_schedules_day').on(table.serviceId, table.dayOfWeek),
]);

export type BookingSchedule = typeof bookingSchedules.$inferSelect;

// ─── Date overrides (holidays, special hours, closures) ────────────────────

export const bookingOverrides = pgTable('booking_overrides', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  serviceId: text('service_id').notNull().references(() => bookingServices.id, { onDelete: 'cascade' }),
  /** The specific date this override applies to (YYYY-MM-DD stored as date string) */
  date: varchar('date', { length: 10 }).notNull(),
  /** If true, fully unavailable on this date (ignores start/end time) */
  isUnavailable: boolean('is_unavailable').notNull().default(false),
  /** Override start time (null + isUnavailable=false = use regular schedule) */
  startTime: varchar('start_time', { length: 5 }),
  /** Override end time */
  endTime: varchar('end_time', { length: 5 }),
  /** Reason for the override (shown to admins) */
  reason: varchar('reason', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_booking_overrides_service_date').on(table.serviceId, table.date),
]);

export type BookingOverride = typeof bookingOverrides.$inferSelect;
