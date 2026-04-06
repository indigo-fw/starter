CREATE TABLE "chat_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"adapter_type" varchar(20) DEFAULT 'openai' NOT NULL,
	"base_url" varchar(500),
	"encrypted_api_key" text NOT NULL,
	"model" varchar(100) NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"max_concurrent" integer DEFAULT 10 NOT NULL,
	"timeout_seconds" integer DEFAULT 60 NOT NULL,
	"config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_chat_providers_status_priority" ON "chat_providers" USING btree ("status","priority");