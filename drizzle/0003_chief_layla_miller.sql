CREATE TABLE "cms_menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_id" uuid NOT NULL,
	"parent_id" uuid,
	"label" varchar(255) NOT NULL,
	"url" varchar(1024),
	"content_type" varchar(30),
	"content_id" uuid,
	"open_in_new_tab" boolean DEFAULT false NOT NULL,
	"order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" varchar(30) NOT NULL,
	"entity_type" varchar(30) NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_title" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" varchar(1024) NOT NULL,
	"secret" varchar(255) NOT NULL,
	"events" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_posts" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "cms_media" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "cms_media" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "cms_media" ADD COLUMN "thumbnail_path" varchar(1024);--> statement-breakpoint
ALTER TABLE "cms_media" ADD COLUMN "medium_path" varchar(1024);--> statement-breakpoint
ALTER TABLE "cms_menu_items" ADD CONSTRAINT "cms_menu_items_menu_id_cms_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."cms_menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_audit_log" ADD CONSTRAINT "cms_audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_menu_items_menu_id_idx" ON "cms_menu_items" USING btree ("menu_id");--> statement-breakpoint
CREATE INDEX "cms_menu_items_parent_order_idx" ON "cms_menu_items" USING btree ("menu_id","parent_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_menus_slug_uniq" ON "cms_menus" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cms_audit_log_entity_idx" ON "cms_audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "cms_audit_log_user_idx" ON "cms_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cms_audit_log_action_idx" ON "cms_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "cms_audit_log_created_at_idx" ON "cms_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cms_webhooks_active_idx" ON "cms_webhooks" USING btree ("active");--> statement-breakpoint
CREATE INDEX "cms_posts_parent_id_idx" ON "cms_posts" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "cms_posts" ADD COLUMN "search_vector" tsvector;--> statement-breakpoint
CREATE INDEX "idx_posts_search" ON "cms_posts" USING GIN("search_vector");