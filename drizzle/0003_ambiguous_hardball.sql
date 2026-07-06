CREATE TABLE "saas_token_lots" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"initial_amount" integer NOT NULL,
	"remaining" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saas_subscriptions" ADD COLUMN "interval" varchar(10);--> statement-breakpoint
ALTER TABLE "saas_token_lots" ADD CONSTRAINT "saas_token_lots_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saas_token_lots_org_expiry_idx" ON "saas_token_lots" USING btree ("organization_id","expires_at");