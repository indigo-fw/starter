CREATE TABLE "saas_discount_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"discount_type" varchar(30) NOT NULL,
	"discount_value" integer,
	"trial_days" integer,
	"trial_price_cents" integer,
	"plan_specific_discounts" jsonb,
	"max_uses" integer,
	"current_uses" integer DEFAULT 0 NOT NULL,
	"max_uses_per_user" integer DEFAULT 1 NOT NULL,
	"valid_from" timestamp,
	"valid_until" timestamp,
	"time_limit_hours" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_discount_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "saas_discount_usages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"discount_code_id" text NOT NULL,
	"plan_id" varchar(50),
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"used_at" timestamp,
	"removed_at" timestamp,
	"transaction_id" text
);
--> statement-breakpoint
CREATE TABLE "saas_payment_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"provider_id" varchar(50) NOT NULL,
	"provider_tx_id" text,
	"amount_cents" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'usd' NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"plan_id" varchar(50),
	"interval" varchar(10),
	"discount_code_id" text,
	"discount_amount_cents" integer DEFAULT 0 NOT NULL,
	"raw_request" jsonb,
	"raw_response" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_task_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"queue" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp DEFAULT now() NOT NULL,
	"locked_until" timestamp,
	"last_error" text,
	"result" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_ticket_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"user_id" text NOT NULL,
	"is_staff" boolean DEFAULT false NOT NULL,
	"body" text NOT NULL,
	"attachments" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"subject" varchar(255) NOT NULL,
	"status" varchar(30) DEFAULT 'open' NOT NULL,
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"assigned_to" text,
	"closed_at" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_affiliate_events" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"referral_id" text,
	"type" varchar(30) NOT NULL,
	"amount_cents" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_affiliates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code" varchar(50) NOT NULL,
	"commission_percent" integer DEFAULT 20 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"total_referrals" integer DEFAULT 0 NOT NULL,
	"total_earnings_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_affiliates_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "saas_affiliates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "saas_referrals" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"referred_user_id" text NOT NULL,
	"referred_org_id" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"converted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_referrals_referred_user_id_unique" UNIQUE("referred_user_id")
);
--> statement-breakpoint
ALTER TABLE "saas_subscription_events" DROP CONSTRAINT "saas_subscription_events_stripe_event_id_unique";--> statement-breakpoint
ALTER TABLE "saas_subscriptions" DROP CONSTRAINT "saas_subscriptions_stripe_subscription_id_unique";--> statement-breakpoint
ALTER TABLE "saas_subscription_events" ADD COLUMN "provider_id" varchar(50) DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE "saas_subscription_events" ADD COLUMN "provider_event_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "saas_subscriptions" ADD COLUMN "provider_id" varchar(50) DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE "saas_subscriptions" ADD COLUMN "provider_customer_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "saas_subscriptions" ADD COLUMN "provider_subscription_id" text;--> statement-breakpoint
ALTER TABLE "saas_subscriptions" ADD COLUMN "provider_price_id" text;--> statement-breakpoint
ALTER TABLE "saas_discount_usages" ADD CONSTRAINT "saas_discount_usages_discount_code_id_saas_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."saas_discount_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_payment_transactions" ADD CONSTRAINT "saas_payment_transactions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_ticket_messages" ADD CONSTRAINT "saas_ticket_messages_ticket_id_saas_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."saas_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_tickets" ADD CONSTRAINT "saas_tickets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_affiliate_events" ADD CONSTRAINT "saas_affiliate_events_affiliate_id_saas_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."saas_affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_referrals" ADD CONSTRAINT "saas_referrals_affiliate_id_saas_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."saas_affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_task_queue_poll" ON "saas_task_queue" USING btree ("queue","status","run_after");--> statement-breakpoint
CREATE INDEX "idx_task_queue_stale" ON "saas_task_queue" USING btree ("status","locked_until");--> statement-breakpoint
CREATE INDEX "idx_ticket_messages_ticket" ON "saas_ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_tickets_org_status" ON "saas_tickets" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_tickets_assigned" ON "saas_tickets" USING btree ("assigned_to","status");--> statement-breakpoint
CREATE INDEX "idx_tickets_created" ON "saas_tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_affiliate_events" ON "saas_affiliate_events" USING btree ("affiliate_id","type","created_at");--> statement-breakpoint
CREATE INDEX "idx_referrals_affiliate" ON "saas_referrals" USING btree ("affiliate_id","status");--> statement-breakpoint
CREATE INDEX "saas_subscriptions_org_idx" ON "saas_subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "saas_subscriptions_status_org_idx" ON "saas_subscriptions" USING btree ("status","organization_id");--> statement-breakpoint
CREATE INDEX "saas_notifications_user_idx" ON "saas_notifications" USING btree ("user_id","read","created_at");--> statement-breakpoint
CREATE INDEX "saas_notifications_org_idx" ON "saas_notifications" USING btree ("org_id");--> statement-breakpoint
ALTER TABLE "saas_subscription_events" DROP COLUMN "stripe_event_id";--> statement-breakpoint
ALTER TABLE "saas_subscriptions" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "saas_subscriptions" DROP COLUMN "stripe_subscription_id";--> statement-breakpoint
ALTER TABLE "saas_subscriptions" DROP COLUMN "stripe_price_id";--> statement-breakpoint
ALTER TABLE "saas_subscription_events" ADD CONSTRAINT "saas_subscription_events_provider_event_id_unique" UNIQUE("provider_event_id");--> statement-breakpoint
ALTER TABLE "saas_subscriptions" ADD CONSTRAINT "saas_subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id");