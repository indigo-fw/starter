CREATE TABLE "cms_custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"field_type" varchar(30) NOT NULL,
	"options" jsonb,
	"content_types" jsonb NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cms_custom_field_definitions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "cms_custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_definition_id" uuid NOT NULL,
	"content_type" varchar(30) NOT NULL,
	"content_id" uuid NOT NULL,
	"value" jsonb
);
--> statement-breakpoint
CREATE TABLE "cms_form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"ip" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"fields" jsonb NOT NULL,
	"recipient_email" varchar(255),
	"success_message" text DEFAULT 'Thank you!',
	"honeypot_field" varchar(50),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cms_forms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "cms_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"hash" char(64) NOT NULL,
	"lang_from" varchar(10) NOT NULL,
	"lang_to" varchar(10) NOT NULL,
	"text_original" text NOT NULL,
	"text_translated" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cms_translations_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
ALTER TABLE "cms_media" ADD COLUMN "blur_data_url" text;--> statement-breakpoint
ALTER TABLE "cms_custom_field_values" ADD CONSTRAINT "cms_custom_field_values_field_definition_id_cms_custom_field_definitions_id_fk" FOREIGN KEY ("field_definition_id") REFERENCES "public"."cms_custom_field_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_form_submissions" ADD CONSTRAINT "cms_form_submissions_form_id_cms_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."cms_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_cfv_content_idx" ON "cms_custom_field_values" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE INDEX "cms_cfv_definition_idx" ON "cms_custom_field_values" USING btree ("field_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_cfv_unique_idx" ON "cms_custom_field_values" USING btree ("field_definition_id","content_type","content_id");--> statement-breakpoint
CREATE INDEX "cms_form_submissions_form_created_idx" ON "cms_form_submissions" USING btree ("form_id","created_at");--> statement-breakpoint
CREATE INDEX "cms_translations_lang_to_idx" ON "cms_translations" USING btree ("lang_to");--> statement-breakpoint
CREATE INDEX "cms_translations_created_at_idx" ON "cms_translations" USING btree ("created_at");