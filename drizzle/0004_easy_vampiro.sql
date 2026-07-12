DROP INDEX "cms_posts_type_lang_slug_uniq";--> statement-breakpoint
DROP INDEX "cms_categories_slug_lang_uniq";--> statement-breakpoint
DROP INDEX "cms_terms_taxonomy_slug_lang_uniq";--> statement-breakpoint
DROP INDEX "cms_portfolio_slug_lang_uniq";--> statement-breakpoint
DROP INDEX "cms_showcase_slug_lang_uniq";--> statement-breakpoint
ALTER TABLE "cms_post_attachments" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cms_posts" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cms_categories" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cms_media" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cms_terms" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cms_audit_log" ALTER COLUMN "entity_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "cms_portfolio" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cms_showcase" ALTER COLUMN "created_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "cms_showcase" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saas_notifications" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saas_projects" ALTER COLUMN "deleted_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cms_showcase" ADD CONSTRAINT "cms_showcase_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "member_organization_id_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_posts_type_lang_slug_uniq" ON "cms_posts" USING btree ("type","lang","slug") WHERE "cms_posts"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_categories_slug_lang_uniq" ON "cms_categories" USING btree ("slug","lang") WHERE "cms_categories"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_terms_taxonomy_slug_lang_uniq" ON "cms_terms" USING btree ("taxonomy_id","slug","lang") WHERE "cms_terms"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_portfolio_slug_lang_uniq" ON "cms_portfolio" USING btree ("slug","lang") WHERE "cms_portfolio"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_showcase_slug_lang_uniq" ON "cms_showcase" USING btree ("slug","lang") WHERE "cms_showcase"."deleted_at" is null;