import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { bookingServices } from './services';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const bookingStatusEnum = pgEnum('booking_status', [
  'pending',       // awaiting confirmation or payment
  'confirmed',     // approved / paid
  'in_progress',   // appointment currently happening
  'completed',     // finished successfully
  'cancelled',     // cancelled by customer or admin
  'no_show',       // customer didn't show up
]);

export const bookingReminderStatusEnum = pgEnum('booking_reminder_status', [
  'scheduled',
  'sent',
  'failed',
]);

// ─── Bookings ──────────────────────────────────────────────────────────────

export const bookings = pgTable('bookings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull(),
  serviceId: text('service_id').notNull().references(() => bookingServices.id),
  /** Human-readable booking reference (BOOK-YYYYMMDD-XXXX) */
  bookingNumber: varchar('booking_number', { length: 50 }).notNull().unique(),
  /** Registered user (null for guest bookings) */
  userId: text('user_id'),
  /** Guest info (when userId is null) */
  guestName: varchar('guest_name', { length: 255 }),
  guestEmail: varchar('guest_email', { length: 255 }),
  guestPhone: varchar('guest_phone', { length: 30 }),
  status: bookingStatusEnum('status').notNull().default('pending'),
  /** Booking time slot */
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),
  /** Number of attendees (for group bookings) */
  attendees: integer('attendees').notNull().default(1),
  /** Snapshot of pricing at booking time (cents) */
  priceCents: integer('price_cents').notNull().default(0),
  currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
  /** Payment reference (from core-payments if applicable) */
  paymentTransactionId: text('payment_transaction_id'),
  paidAt: timestamp('paid_at'),
  /** Service snapshot at booking time (name, duration, location) */
  serviceSnapshot: jsonb('service_snapshot'),
  /** Customer notes */
  customerNote: varchar('customer_note', { length: 1000 }),
  /** Admin internal notes */
  adminNote: text('admin_note'),
  /** Cancellation details */
  cancellationReason: varchar('cancellation_reason', { length: 500 }),
  cancelledAt: timestamp('cancelled_at'),
  cancelledBy: text('cancelled_by'),
  /** Flexible metadata (custom form responses, etc.) */
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('idx_bookings_org').on(table.organizationId),
  index('idx_bookings_user').on(table.userId),
  index('idx_bookings_service').on(table.serviceId),
  index('idx_bookings_status').on(table.status),
  index('idx_bookings_number').on(table.bookingNumber),
  index('idx_bookings_start').on(table.startTime),
  index('idx_bookings_service_time').on(table.serviceId, table.startTime, table.endTime),
]);

export type Booking = typeof bookings.$inferSelect;

// ─── Booking Events (audit trail) ──────────────────────────────────────────

export const bookingEvents = pgTable('booking_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookingId: text('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  fromStatus: varchar('from_status', { length: 30 }),
  toStatus: varchar('to_status', { length: 30 }).notNull(),
  /** Who triggered the change (userId or 'system') */
  actor: text('actor').notNull(),
  note: varchar('note', { length: 500 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_booking_events_booking').on(table.bookingId),
]);

export type BookingEvent = typeof bookingEvents.$inferSelect;

// ─── Booking Reminders ─────────────────────────────────────────────────────

export const bookingReminders = pgTable('booking_reminders', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookingId: text('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  /** Reminder type (e.g. 24h before, 1h before) */
  type: varchar('type', { length: 50 }).notNull(),
  scheduledAt: timestamp('scheduled_at').notNull(),
  sentAt: timestamp('sent_at'),
  status: bookingReminderStatusEnum('status').notNull().default('scheduled'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('idx_booking_reminders_scheduled').on(table.status, table.scheduledAt),
  index('idx_booking_reminders_booking').on(table.bookingId),
]);

export type BookingReminder = typeof bookingReminders.$inferSelect;
