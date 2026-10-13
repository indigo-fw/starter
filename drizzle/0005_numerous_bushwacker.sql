ALTER TABLE "cms_post_attachments" ADD COLUMN "source_path" varchar(512);--> statement-breakpoint
ALTER TABLE "cms_post_attachments" ADD COLUMN "source_hash" varchar(32);--> statement-breakpoint
CREATE UNIQUE INDEX "cms_post_attachments_source_path_active_uniq" ON "cms_post_attachments" USING btree ("source_path") WHERE "cms_post_attachments"."deleted_at" is null;