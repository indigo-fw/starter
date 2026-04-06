CREATE TABLE "cms_post_categories" (
	"post_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "cms_post_categories_post_id_category_id_pk" PRIMARY KEY("post_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "cms_post_categories" ADD CONSTRAINT "cms_post_categories_post_id_cms_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."cms_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_post_categories" ADD CONSTRAINT "cms_post_categories_category_id_cms_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."cms_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_post_categories_post_id_idx" ON "cms_post_categories" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "cms_post_categories_category_id_idx" ON "cms_post_categories" USING btree ("category_id");