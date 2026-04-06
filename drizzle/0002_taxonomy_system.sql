CREATE TABLE "cms_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taxonomy_id" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"lang" varchar(2) DEFAULT 'en' NOT NULL,
	"status" smallint DEFAULT 1 NOT NULL,
	"order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cms_term_relationships" (
	"object_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"taxonomy_id" varchar(50) NOT NULL,
	CONSTRAINT "cms_term_relationships_object_id_term_id_taxonomy_id_pk" PRIMARY KEY("object_id","term_id","taxonomy_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cms_terms_taxonomy_slug_lang_uniq" ON "cms_terms" USING btree ("taxonomy_id","slug","lang");--> statement-breakpoint
CREATE INDEX "cms_terms_taxonomy_id_idx" ON "cms_terms" USING btree ("taxonomy_id");--> statement-breakpoint
CREATE INDEX "cms_terms_deleted_at_idx" ON "cms_terms" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cms_terms_status_order_idx" ON "cms_terms" USING btree ("status","order");--> statement-breakpoint
CREATE INDEX "cms_term_rel_object_id_idx" ON "cms_term_relationships" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "cms_term_rel_term_id_idx" ON "cms_term_relationships" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "cms_term_rel_taxonomy_id_idx" ON "cms_term_relationships" USING btree ("taxonomy_id");--> statement-breakpoint
-- Migrate existing post-category relationships to term_relationships
INSERT INTO "cms_term_relationships" ("object_id", "term_id", "taxonomy_id")
SELECT "post_id", "category_id", 'category'
FROM "cms_post_categories";--> statement-breakpoint
DROP TABLE "cms_post_categories";