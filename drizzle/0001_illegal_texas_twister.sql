CREATE TABLE "chat_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reported_by_id" text NOT NULL,
	"message_id" text,
	"conversation_id" text,
	"text" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" varchar(50) NOT NULL,
	"entity_type" varchar(30),
	"entity_id" text,
	"reason" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_voice_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"character_id" text NOT NULL,
	"cost_per_minute" integer NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"minutes_billed" integer DEFAULT 0 NOT NULL,
	"tokens_charged" integer DEFAULT 0 NOT NULL,
	"charged" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"preferred_name" varchar(100),
	"preferred_gender" smallint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_characters" ADD COLUMN "featured_image_id" text;--> statement-breakpoint
ALTER TABLE "chat_characters" ADD COLUMN "featured_video_id" text;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "last_read_message_id" text;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "lang" varchar(10);--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "lang_detected_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "gender_id" smallint;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "sexuality_id" smallint;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "ethnicity_id" smallint;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "personality_id" smallint;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "kink_id" smallint;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "job_id" smallint;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "hobbies" jsonb;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "relationship_id" smallint;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "age" smallint;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "user_name" varchar(100);--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "born_in" varchar(255);--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "living_in" varchar(255);--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "custom_trait" varchar(255);--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "conversation_hash" varchar(32);--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "summarization_failures" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "last_summarization_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_media" ADD COLUMN "content_hash" varchar(32);--> statement-breakpoint
ALTER TABLE "chat_media" ADD COLUMN "source_filepath" varchar(1024);--> statement-breakpoint
ALTER TABLE "chat_media" ADD COLUMN "is_nsfw" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_media" ADD COLUMN "optimization_status" varchar(20);--> statement-breakpoint
ALTER TABLE "chat_media" ADD COLUMN "checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_media" ADD COLUMN "disapproved_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_media" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "idx_chat_reports_status" ON "chat_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_reports_user" ON "chat_reports" USING btree ("reported_by_id");--> statement-breakpoint
CREATE INDEX "idx_chat_audit_user" ON "chat_audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_audit_action" ON "chat_audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_voice_calls_user" ON "chat_voice_calls" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_chat_voice_calls_conv" ON "chat_voice_calls" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_chat_voice_calls_charged" ON "chat_voice_calls" USING btree ("charged");--> statement-breakpoint
CREATE INDEX "idx_chat_media_hash" ON "chat_media" USING btree ("content_hash");