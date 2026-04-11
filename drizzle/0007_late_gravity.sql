CREATE TABLE "cms_author_relationships" (
	"object_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content_type" varchar(50) NOT NULL,
	"order" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "cms_author_relationships_object_id_author_id_content_type_pk" PRIMARY KEY("object_id","author_id","content_type")
);
--> statement-breakpoint
CREATE TABLE "cms_authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"bio" text,
	"avatar" varchar(1024),
	"social_urls" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_author_relationships" ADD CONSTRAINT "cms_author_relationships_author_id_cms_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."cms_authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_authors" ADD CONSTRAINT "cms_authors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_author_rel_object_ct_idx" ON "cms_author_relationships" USING btree ("object_id","content_type");--> statement-breakpoint
CREATE INDEX "cms_author_rel_author_idx" ON "cms_author_relationships" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_authors_slug_uniq" ON "cms_authors" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cms_authors_user_id_idx" ON "cms_authors" USING btree ("user_id");