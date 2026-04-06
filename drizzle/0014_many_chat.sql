CREATE TABLE "cms_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"content_type" varchar(50) NOT NULL,
	"content_id" uuid NOT NULL,
	"parent_id" uuid,
	"body" text NOT NULL,
	"status" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cms_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"content_type" varchar(50) NOT NULL,
	"content_id" uuid NOT NULL,
	"reaction_type" varchar(10) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_comments" ADD CONSTRAINT "cms_comments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_reactions" ADD CONSTRAINT "cms_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_comments_content_idx" ON "cms_comments" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE INDEX "cms_comments_parent_idx" ON "cms_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "cms_comments_deleted_idx" ON "cms_comments" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_reactions_user_content_uniq" ON "cms_reactions" USING btree ("user_id","content_type","content_id");--> statement-breakpoint
CREATE INDEX "cms_reactions_content_idx" ON "cms_reactions" USING btree ("content_type","content_id");