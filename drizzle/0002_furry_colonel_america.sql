ALTER TABLE "saas_tickets" ADD COLUMN "satisfaction" varchar(20);--> statement-breakpoint
ALTER TABLE "saas_tickets" ADD COLUMN "satisfaction_comment" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_media_id_chat_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."chat_media"("id") ON DELETE set null ON UPDATE no action;