CREATE TABLE "saas_support_chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" varchar(20) NOT NULL,
	"body" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_support_chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"visitor_id" text NOT NULL,
	"user_id" text,
	"email" varchar(255),
	"status" varchar(30) DEFAULT 'ai_active' NOT NULL,
	"ticket_id" text,
	"subject" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "saas_tickets" ADD COLUMN "source" varchar(20) DEFAULT 'form' NOT NULL;--> statement-breakpoint
ALTER TABLE "saas_tickets" ADD COLUMN "chat_session_id" text;--> statement-breakpoint
ALTER TABLE "saas_support_chat_messages" ADD CONSTRAINT "saas_support_chat_messages_session_id_saas_support_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."saas_support_chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_support_chat_messages_session" ON "saas_support_chat_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_support_chat_sessions_visitor" ON "saas_support_chat_sessions" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "idx_support_chat_sessions_user" ON "saas_support_chat_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_support_chat_sessions_status" ON "saas_support_chat_sessions" USING btree ("status");