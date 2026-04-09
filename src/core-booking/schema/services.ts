import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const bookingServiceTypeEnum = pgEnum('booking_service_type', [
  'appointment',   // 1-on-1 appointment (consultant, doctor, salon)
  'class',         // group class (yoga, workshop, webinar)
  'resource',      // resource reservation (room, equipment, court)
  'event',         // one-time event with limited capacity
]);

export const bookingServiceStatusEnum = pgEnum('booking_service_status', ['draft', 'published', 'archived']);

// ─── Services (what can be booked) ─────────────────────────────────────────

export const bookingServiceColumns = {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull(),
  type: bookingServiceTypeEnum('type').notNull().default('appointment'),
  status: bookingServiceStatusEnum('status').notNull().default('draft'),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  shortDescription: varchar('short_description', { length: 500 }),
  /** Duration in minutes */
  durationMinutes: integer('duration_minutes').notNull().default(60),
  /** Buffer between consecutive bookings (minutes) */
  bufferMinutes: integer('buffer_minutes').notNull().default(0),
  /** Price in cents (0 = free) */
  priceCents: integer('price_cents').notNull().default(0),
  currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
  /** Max simultaneous bookings per slot (1 = appointment, >1 = class/resource) */
  maxCapacity: integer('max_capacity').notNull().default(1),
  /** Require admin approval before confirming */
  requiresApproval: boolean('requires_approval').notNull().default(false),
  /** How far in advance can bookings be made (hours, null = unlimited) */
  minAdvanceHours: integer('min_advance_hours'),
  /** Max advance booking window (hours, null = unlimited) */
  maxAdvanceHours: integer('max_advance_hours'),
  /** Cancellation policy — deadline in hours before start (null = no cancellation) */
  cancellationDeadlineHours: integer('cancellation_deadline_hours'),
  /** Location info (physical address, room name, or virtual meeting URL) */
  location: varchar('location', { length: 500 }),
  /** Timezone for this service's schedule (IANA format) */
  timezone: varchar('timezone', { length: 100 }).notNull().default('UTC'),
  /** Featured image URL */
  featuredImage: text('featured_image'),
  /** Sort order for display */
  sortOrder: integer('sort_order').notNull().default(0),
  /** Flexible metadata (custom fields, form schema, etc.) */
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
};

export const bookingServices = pgTable('booking_services', bookingServiceColumns, (table) => [
  index('idx_booking_services_org').on(table.organizationId),
  index('idx_booking_services_slug').on(table.slug),
  index('idx_booking_services_status').on(table.status),
  index('idx_booking_services_deleted').on(table.deletedAt),
]);

export type BookingService = typeof bookingServices.$inferSelect;
