CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp,
	"lang" varchar(2),
	"country" varchar(2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cms_content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" varchar(30) NOT NULL,
	"content_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_options" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_post_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid,
	"filename" varchar(255) NOT NULL,
	"filepath" varchar(1024) NOT NULL,
	"file_type" smallint NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"alt_text" varchar(255),
	"uploaded_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cms_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" smallint NOT NULL,
	"status" smallint NOT NULL,
	"lang" varchar(2) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"meta_description" text,
	"seo_title" varchar(100),
	"featured_image" varchar(1024),
	"featured_image_alt" varchar(500),
	"json_ld" text,
	"noindex" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"preview_token" varchar(64),
	"translation_group" uuid,
	"fallback_to_default" boolean,
	"author_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cms_slug_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"old_slug" varchar(255) NOT NULL,
	"content_type" varchar(30) NOT NULL,
	"content_id" uuid NOT NULL,
	"url_prefix" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"lang" varchar(2) DEFAULT 'en' NOT NULL,
	"title" varchar(255) NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"icon" varchar(255),
	"meta_description" text,
	"seo_title" varchar(255),
	"order" smallint DEFAULT 0 NOT NULL,
	"status" smallint DEFAULT 0 NOT NULL,
	"published_at" timestamp,
	"noindex" boolean DEFAULT false NOT NULL,
	"fallback_to_default" boolean,
	"translation_group" uuid,
	"json_ld" text,
	"preview_token" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cms_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" varchar(255) NOT NULL,
	"filepath" varchar(1024) NOT NULL,
	"file_type" smallint NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"alt_text" varchar(255),
	"uploaded_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_revisions" ADD CONSTRAINT "cms_content_revisions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_post_attachments" ADD CONSTRAINT "cms_post_attachments_post_id_cms_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."cms_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_post_attachments" ADD CONSTRAINT "cms_post_attachments_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_posts" ADD CONSTRAINT "cms_posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_media" ADD CONSTRAINT "cms_media_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_content_revisions_type_id_idx" ON "cms_content_revisions" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE INDEX "cms_post_attachments_post_id_idx" ON "cms_post_attachments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "cms_post_attachments_file_type_idx" ON "cms_post_attachments" USING btree ("file_type");--> statement-breakpoint
CREATE INDEX "cms_post_attachments_deleted_at_idx" ON "cms_post_attachments" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_posts_type_lang_slug_uniq" ON "cms_posts" USING btree ("type","lang","slug");--> statement-breakpoint
CREATE INDEX "cms_posts_type_status_lang_idx" ON "cms_posts" USING btree ("type","status","lang");--> statement-breakpoint
CREATE INDEX "cms_posts_slug_lang_idx" ON "cms_posts" USING btree ("slug","lang");--> statement-breakpoint
CREATE INDEX "cms_posts_status_idx" ON "cms_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cms_posts_published_at_idx" ON "cms_posts" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "cms_posts_translation_group_idx" ON "cms_posts" USING btree ("translation_group");--> statement-breakpoint
CREATE INDEX "cms_posts_deleted_at_idx" ON "cms_posts" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cms_posts_author_id_idx" ON "cms_posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "cms_posts_created_at_idx" ON "cms_posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cms_slug_redirects_lookup_idx" ON "cms_slug_redirects" USING btree ("old_slug","url_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_categories_slug_lang_uniq" ON "cms_categories" USING btree ("slug","lang");--> statement-breakpoint
CREATE INDEX "cms_categories_status_order_idx" ON "cms_categories" USING btree ("status","order");--> statement-breakpoint
CREATE INDEX "cms_categories_published_at_idx" ON "cms_categories" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "cms_categories_deleted_at_idx" ON "cms_categories" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cms_categories_translation_group_idx" ON "cms_categories" USING btree ("translation_group");--> statement-breakpoint
CREATE INDEX "cms_media_file_type_idx" ON "cms_media" USING btree ("file_type");--> statement-breakpoint
CREATE INDEX "cms_media_uploaded_by_id_idx" ON "cms_media" USING btree ("uploaded_by_id");--> statement-breakpoint
CREATE INDEX "cms_media_deleted_at_idx" ON "cms_media" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cms_media_created_at_idx" ON "cms_media" USING btree ("created_at");