CREATE TABLE "cms_post_authors" (
	"post_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "cms_post_authors_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "cms_post_authors" ADD CONSTRAINT "cms_post_authors_post_id_cms_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."cms_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_post_authors" ADD CONSTRAINT "cms_post_authors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_post_authors_post_id_idx" ON "cms_post_authors" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "cms_post_authors_user_id_idx" ON "cms_post_authors" USING btree ("user_id");