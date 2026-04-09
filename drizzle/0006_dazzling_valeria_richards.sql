CREATE TYPE "public"."booking_service_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."booking_service_type" AS ENUM('appointment', 'class', 'resource', 'event');--> statement-breakpoint
CREATE TYPE "public"."booking_reminder_status" AS ENUM('scheduled', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TABLE "booking_services" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" "booking_service_type" DEFAULT 'appointment' NOT NULL,
	"status" "booking_service_status" DEFAULT 'draft' NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"short_description" varchar(500),
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"max_capacity" integer DEFAULT 1 NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"min_advance_hours" integer,
	"max_advance_hours" integer,
	"cancellation_deadline_hours" integer,
	"location" varchar(500),
	"timezone" varchar(100) DEFAULT 'UTC' NOT NULL,
	"featured_image" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "booking_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"date" varchar(10) NOT NULL,
	"is_unavailable" boolean DEFAULT false NOT NULL,
	"start_time" varchar(5),
	"end_time" varchar(5),
	"reason" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_events" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"from_status" varchar(30),
	"to_status" varchar(30) NOT NULL,
	"actor" text NOT NULL,
	"note" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"sent_at" timestamp,
	"status" "booking_reminder_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"service_id" text NOT NULL,
	"booking_number" varchar(50) NOT NULL,
	"user_id" text,
	"guest_name" varchar(255),
	"guest_email" varchar(255),
	"guest_phone" varchar(30),
	"status" "booking_status" DEFAULT 'pending' NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"attendees" integer DEFAULT 1 NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"payment_transaction_id" text,
	"paid_at" timestamp,
	"service_snapshot" jsonb,
	"customer_note" varchar(1000),
	"admin_note" text,
	"cancellation_reason" varchar(500),
	"cancelled_at" timestamp,
	"cancelled_by" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_booking_number_unique" UNIQUE("booking_number")
);
--> statement-breakpoint
ALTER TABLE "booking_overrides" ADD CONSTRAINT "booking_overrides_service_id_booking_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."booking_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_schedules" ADD CONSTRAINT "booking_schedules_service_id_booking_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."booking_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_reminders" ADD CONSTRAINT "booking_reminders_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_booking_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."booking_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_booking_services_org" ON "booking_services" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_booking_services_slug" ON "booking_services" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_booking_services_status" ON "booking_services" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_booking_services_deleted" ON "booking_services" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_booking_overrides_service_date" ON "booking_overrides" USING btree ("service_id","date");--> statement-breakpoint
CREATE INDEX "idx_booking_schedules_service" ON "booking_schedules" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "idx_booking_schedules_day" ON "booking_schedules" USING btree ("service_id","day_of_week");--> statement-breakpoint
CREATE INDEX "idx_booking_events_booking" ON "booking_events" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_reminders_scheduled" ON "booking_reminders" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_booking_reminders_booking" ON "booking_reminders" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_bookings_org" ON "bookings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_bookings_user" ON "bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_bookings_service" ON "bookings" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "idx_bookings_status" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_bookings_number" ON "bookings" USING btree ("booking_number");--> statement-breakpoint
CREATE INDEX "idx_bookings_start" ON "bookings" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "idx_bookings_service_time" ON "bookings" USING btree ("service_id","start_time","end_time");