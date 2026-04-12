CREATE TABLE "saas_push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_push_subs_endpoint_uniq" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "saas_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" varchar(20) NOT NULL,
	"scopes" jsonb,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_api_keys_prefix_uniq" UNIQUE("prefix")
);
--> statement-breakpoint
CREATE TABLE "saas_api_request_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"api_key_id" text NOT NULL,
	"method" varchar(10) NOT NULL,
	"path" varchar(500) NOT NULL,
	"status_code" integer NOT NULL,
	"response_time_ms" integer,
	"ip_address" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_docs" DROP CONSTRAINT "cms_docs_slug_unique";--> statement-breakpoint
DROP INDEX "idx_docs_slug";--> statement-breakpoint
ALTER TABLE "cms_docs" ADD COLUMN "locale" varchar(10) DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "saas_push_subscriptions" ADD CONSTRAINT "saas_push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_api_keys" ADD CONSTRAINT "saas_api_keys_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_api_request_logs" ADD CONSTRAINT "saas_api_request_logs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_api_request_logs" ADD CONSTRAINT "saas_api_request_logs_api_key_id_saas_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."saas_api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saas_push_subs_user_idx" ON "saas_push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saas_api_keys_org_idx" ON "saas_api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "saas_api_keys_hash_idx" ON "saas_api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "saas_api_req_logs_org_idx" ON "saas_api_request_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "saas_api_req_logs_key_idx" ON "saas_api_request_logs" USING btree ("api_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_docs_slug_locale" ON "cms_docs" USING btree ("slug","locale");--> statement-breakpoint
CREATE INDEX "idx_docs_locale" ON "cms_docs" USING btree ("locale");