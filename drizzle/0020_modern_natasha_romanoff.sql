CREATE TABLE "saas_user_acquisitions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ref_code" varchar(255),
	"utm_source" varchar(255),
	"utm_medium" varchar(255),
	"utm_campaign" varchar(500),
	"extra" jsonb,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_user_acquisitions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "cms_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event" varchar(100) NOT NULL,
	"status" varchar(20) NOT NULL,
	"status_code" integer,
	"error" text,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_webhook_deliveries" ADD CONSTRAINT "cms_webhook_deliveries_webhook_id_cms_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."cms_webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_acquisitions_utm_source" ON "saas_user_acquisitions" USING btree ("utm_source");--> statement-breakpoint
CREATE INDEX "idx_user_acquisitions_ref_code" ON "saas_user_acquisitions" USING btree ("ref_code");--> statement-breakpoint
CREATE INDEX "cms_webhook_deliveries_webhook_idx" ON "cms_webhook_deliveries" USING btree ("webhook_id","created_at");--> statement-breakpoint
CREATE INDEX "cms_webhook_deliveries_status_idx" ON "cms_webhook_deliveries" USING btree ("status");