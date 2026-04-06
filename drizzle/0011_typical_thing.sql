CREATE TABLE "saas_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "saas_projects" ADD CONSTRAINT "saas_projects_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_projects" ADD CONSTRAINT "saas_projects_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saas_projects_org_idx" ON "saas_projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "saas_projects_deleted_idx" ON "saas_projects" USING btree ("deleted_at");