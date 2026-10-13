ALTER TYPE "public"."store_return_status" ADD VALUE 'refunding';--> statement-breakpoint
ALTER TABLE "store_orders" ADD COLUMN "refunded_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_posts_group_lang_uniq" ON "cms_posts" USING btree ("translation_group","lang") WHERE "cms_posts"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_categories_group_lang_uniq" ON "cms_categories" USING btree ("translation_group","lang") WHERE "cms_categories"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_portfolio_group_lang_uniq" ON "cms_portfolio" USING btree ("translation_group","lang") WHERE "cms_portfolio"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_showcase_group_lang_uniq" ON "cms_showcase" USING btree ("translation_group","lang") WHERE "cms_showcase"."deleted_at" is null;