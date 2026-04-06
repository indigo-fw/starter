CREATE TABLE "cms_portfolio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"lang" varchar(2) DEFAULT 'en' NOT NULL,
	"title" varchar(255) NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"status" smallint DEFAULT 0 NOT NULL,
	"published_at" timestamp,
	"meta_description" text,
	"seo_title" varchar(255),
	"noindex" boolean DEFAULT false NOT NULL,
	"preview_token" varchar(64),
	"translation_group" uuid,
	"fallback_to_default" boolean,
	"featured_image" text,
	"featured_image_alt" varchar(255),
	"client_name" varchar(255),
	"project_url" varchar(1024),
	"tech_stack" jsonb DEFAULT '[]'::jsonb,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cms_portfolio_slug_lang_uniq" ON "cms_portfolio" USING btree ("slug","lang");--> statement-breakpoint
CREATE INDEX "cms_portfolio_status_idx" ON "cms_portfolio" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cms_portfolio_published_at_idx" ON "cms_portfolio" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "cms_portfolio_deleted_at_idx" ON "cms_portfolio" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cms_portfolio_translation_group_idx" ON "cms_portfolio" USING btree ("translation_group");