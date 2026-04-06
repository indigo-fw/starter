CREATE TABLE "saas_token_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"lifetime_added" integer DEFAULT 0 NOT NULL,
	"lifetime_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_token_balances_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "saas_token_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reason" varchar(100) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saas_token_balances" ADD CONSTRAINT "saas_token_balances_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_token_transactions" ADD CONSTRAINT "saas_token_transactions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saas_token_tx_org_idx" ON "saas_token_transactions" USING btree ("organization_id","created_at");