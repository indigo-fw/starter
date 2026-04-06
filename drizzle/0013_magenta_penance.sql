CREATE TABLE "cms_showcase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"lang" varchar(2) DEFAULT 'en' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"card_type" varchar(20) DEFAULT 'richtext' NOT NULL,
	"media_url" text,
	"thumbnail_url" text,
	"status" smallint DEFAULT 0 NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"published_at" timestamp,
	"meta_description" text,
	"seo_title" varchar(255),
	"noindex" boolean DEFAULT false NOT NULL,
	"preview_token" varchar(64),
	"translation_group" uuid,
	"fallback_to_default" boolean,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cms_showcase_slug_lang_uniq" ON "cms_showcase" USING btree ("slug","lang");--> statement-breakpoint
CREATE INDEX "cms_showcase_status_idx" ON "cms_showcase" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cms_showcase_sort_order_idx" ON "cms_showcase" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "cms_showcase_deleted_at_idx" ON "cms_showcase" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cms_showcase_translation_group_idx" ON "cms_showcase" USING btree ("translation_group");