CREATE TYPE "public"."store_product_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."store_product_type" AS ENUM('simple', 'variable', 'digital', 'subscription');--> statement-breakpoint
CREATE TYPE "public"."store_order_status" AS ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp,
	"lang" varchar(2),
	"country" varchar(2),
	"state" varchar(50),
	"timezone" varchar(50),
	"preferred_currency" varchar(3),
	"last_ip" varchar(45),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cms_content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" varchar(30) NOT NULL,
	"content_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_options" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_post_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid,
	"filename" varchar(255) NOT NULL,
	"filepath" varchar(1024) NOT NULL,
	"file_type" smallint NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"alt_text" varchar(255),
	"uploaded_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cms_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" smallint NOT NULL,
	"status" smallint NOT NULL,
	"lang" varchar(2) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"meta_description" text,
	"seo_title" varchar(100),
	"featured_image" varchar(1024),
	"featured_image_alt" varchar(500),
	"json_ld" text,
	"noindex" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"preview_token" varchar(64),
	"translation_group" uuid,
	"fallback_to_default" boolean,
	"parent_id" uuid,
	"author_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cms_slug_redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"old_slug" varchar(255) NOT NULL,
	"content_type" varchar(30) NOT NULL,
	"content_id" uuid NOT NULL,
	"url_prefix" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"lang" varchar(2) DEFAULT 'en' NOT NULL,
	"title" varchar(255) NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"icon" varchar(255),
	"meta_description" text,
	"seo_title" varchar(255),
	"order" smallint DEFAULT 0 NOT NULL,
	"status" smallint DEFAULT 0 NOT NULL,
	"published_at" timestamp,
	"noindex" boolean DEFAULT false NOT NULL,
	"fallback_to_default" boolean,
	"translation_group" uuid,
	"json_ld" text,
	"preview_token" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cms_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" varchar(255) NOT NULL,
	"filepath" varchar(1024) NOT NULL,
	"file_type" smallint NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"title" varchar(255),
	"alt_text" varchar(255),
	"description" text,
	"width" integer,
	"height" integer,
	"thumbnail_path" varchar(1024),
	"medium_path" varchar(1024),
	"blur_data_url" text,
	"uploaded_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cms_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taxonomy_id" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"lang" varchar(2) DEFAULT 'en' NOT NULL,
	"status" smallint DEFAULT 1 NOT NULL,
	"order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cms_term_relationships" (
	"object_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"taxonomy_id" varchar(50) NOT NULL,
	CONSTRAINT "cms_term_relationships_object_id_term_id_taxonomy_id_pk" PRIMARY KEY("object_id","term_id","taxonomy_id")
);
--> statement-breakpoint
CREATE TABLE "cms_menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_id" uuid NOT NULL,
	"parent_id" uuid,
	"label" varchar(255) NOT NULL,
	"url" varchar(1024),
	"content_type" varchar(30),
	"content_id" uuid,
	"open_in_new_tab" boolean DEFAULT false NOT NULL,
	"order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"action" varchar(30) NOT NULL,
	"entity_type" varchar(30) NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_title" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" varchar(1024) NOT NULL,
	"secret" varchar(255) NOT NULL,
	"events" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"field_type" varchar(30) NOT NULL,
	"options" jsonb,
	"content_types" jsonb NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cms_custom_field_definitions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "cms_custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_definition_id" uuid NOT NULL,
	"content_type" varchar(30) NOT NULL,
	"content_id" uuid NOT NULL,
	"value" jsonb
);
--> statement-breakpoint
CREATE TABLE "cms_form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"ip" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"fields" jsonb NOT NULL,
	"recipient_email" varchar(255),
	"success_message" text DEFAULT 'Thank you!',
	"honeypot_field" varchar(50),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cms_forms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "cms_portfolio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"lang" varchar(2) DEFAULT 'en' NOT NULL,
	"title" varchar(255) NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"status" smallint DEFAULT 0 NOT NULL,
	"published_at" timestamp,
	"meta_description" text,
	"seo_title" varchar(255),
	"noindex" boolean DEFAULT false NOT NULL,
	"preview_token" varchar(64),
	"translation_group" uuid,
	"fallback_to_default" boolean,
	"featured_image" text,
	"featured_image_alt" varchar(255),
	"client_name" varchar(255),
	"project_url" varchar(1024),
	"tech_stack" jsonb DEFAULT '[]'::jsonb,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "cms_showcase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"lang" varchar(2) DEFAULT 'en' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"card_type" varchar(20) DEFAULT 'richtext' NOT NULL,
	"media_url" text,
	"thumbnail_url" text,
	"status" smallint DEFAULT 0 NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"published_at" timestamp,
	"meta_description" text,
	"seo_title" varchar(255),
	"noindex" boolean DEFAULT false NOT NULL,
	"preview_token" varchar(64),
	"translation_group" uuid,
	"fallback_to_default" boolean,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
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
CREATE TABLE "cms_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"hash" char(64) NOT NULL,
	"lang_from" varchar(10) NOT NULL,
	"lang_to" varchar(10) NOT NULL,
	"text_original" text NOT NULL,
	"text_translated" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cms_translations_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "cms_user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member',
	"status" text DEFAULT 'pending' NOT NULL,
	"inviter_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "saas_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"type" varchar(20) DEFAULT 'info' NOT NULL,
	"category" varchar(30) DEFAULT 'system' NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"action_url" text,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "saas_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "saas_task_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"queue" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp DEFAULT now() NOT NULL,
	"locked_until" timestamp,
	"last_error" text,
	"result" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event" varchar(100) NOT NULL,
	"status" varchar(20) NOT NULL,
	"status_code" integer,
	"error" text,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_payment_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"provider_id" varchar(50) NOT NULL,
	"provider_tx_id" text,
	"amount_cents" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'usd' NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"plan_id" varchar(50),
	"interval" varchar(10),
	"discount_code_id" text,
	"discount_amount_cents" integer DEFAULT 0 NOT NULL,
	"raw_request" jsonb,
	"raw_response" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_subscription_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" varchar(50) DEFAULT 'stripe' NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" varchar(100) NOT NULL,
	"data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_subscription_events_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "saas_discount_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"discount_type" varchar(30) NOT NULL,
	"discount_value" integer,
	"trial_days" integer,
	"trial_price_cents" integer,
	"plan_specific_discounts" jsonb,
	"max_uses" integer,
	"current_uses" integer DEFAULT 0 NOT NULL,
	"max_uses_per_user" integer DEFAULT 1 NOT NULL,
	"valid_from" timestamp,
	"valid_until" timestamp,
	"time_limit_hours" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_discount_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "saas_discount_usages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"discount_code_id" text NOT NULL,
	"plan_id" varchar(50),
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"used_at" timestamp,
	"removed_at" timestamp,
	"transaction_id" text
);
--> statement-breakpoint
CREATE TABLE "saas_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider_id" varchar(50) DEFAULT 'stripe' NOT NULL,
	"provider_customer_id" text NOT NULL,
	"provider_subscription_id" text,
	"provider_price_id" text,
	"plan_id" varchar(50) DEFAULT 'free' NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"trial_end" timestamp,
	"grace_period_ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_subscriptions_provider_subscription_id_unique" UNIQUE("provider_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "saas_token_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"lifetime_added" integer DEFAULT 0 NOT NULL,
	"lifetime_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_token_balances_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "saas_token_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reason" varchar(100) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "saas_ticket_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"user_id" text NOT NULL,
	"is_staff" boolean DEFAULT false NOT NULL,
	"body" text NOT NULL,
	"attachments" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"subject" varchar(255) NOT NULL,
	"status" varchar(30) DEFAULT 'open' NOT NULL,
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"assigned_to" text,
	"source" varchar(20) DEFAULT 'form' NOT NULL,
	"chat_session_id" text,
	"closed_at" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_affiliate_events" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"referral_id" text,
	"type" varchar(30) NOT NULL,
	"amount_cents" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saas_affiliates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code" varchar(50) NOT NULL,
	"commission_percent" integer DEFAULT 20 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"total_referrals" integer DEFAULT 0 NOT NULL,
	"total_earnings_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_affiliates_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "saas_affiliates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "saas_referrals" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"referred_user_id" text NOT NULL,
	"referred_org_id" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"converted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_referrals_referred_user_id_unique" UNIQUE("referred_user_id")
);
--> statement-breakpoint
CREATE TABLE "saas_user_acquisitions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ref_code" varchar(255),
	"utm_source" varchar(255),
	"utm_medium" varchar(255),
	"utm_campaign" varchar(500),
	"extra" jsonb,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saas_user_acquisitions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "cms_docs" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(500) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"section" varchar(255),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"parent_id" text,
	"meta_title" varchar(255),
	"meta_description" varchar(500),
	"metadata" jsonb,
	"status" varchar(20) DEFAULT 'published' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cms_docs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "store_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"parent_id" text,
	"image" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "store_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "store_product_categories" (
	"product_id" text NOT NULL,
	"category_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_product_images" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"url" text NOT NULL,
	"alt" varchar(255),
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"sku" varchar(100),
	"price_cents" integer NOT NULL,
	"compare_price_cents" integer,
	"stock_quantity" integer DEFAULT 0,
	"weight_grams" integer,
	"options" jsonb NOT NULL,
	"image" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_products" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "store_product_type" DEFAULT 'simple' NOT NULL,
	"status" "store_product_status" DEFAULT 'draft' NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"short_description" varchar(500),
	"price_cents" integer,
	"compare_price_cents" integer,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"sku" varchar(100),
	"track_inventory" boolean DEFAULT false NOT NULL,
	"stock_quantity" integer DEFAULT 0,
	"low_stock_threshold" integer DEFAULT 5,
	"allow_backorders" boolean DEFAULT false NOT NULL,
	"weight_grams" integer,
	"digital_file_url" text,
	"download_limit" integer,
	"subscription_plan_id" varchar(100),
	"meta_title" varchar(255),
	"meta_description" varchar(500),
	"featured_image" text,
	"tax_class" varchar(50) DEFAULT 'standard' NOT NULL,
	"requires_shipping" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "store_products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "store_variant_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"name" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" varchar(20) DEFAULT 'shipping' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"company" varchar(255),
	"address_1" varchar(255) NOT NULL,
	"address_2" varchar(255),
	"city" varchar(100) NOT NULL,
	"state" varchar(100),
	"postal_code" varchar(20) NOT NULL,
	"country" varchar(2) NOT NULL,
	"phone" varchar(30),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_cart_items" (
	"id" text PRIMARY KEY NOT NULL,
	"cart_id" text NOT NULL,
	"product_id" text NOT NULL,
	"variant_id" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_carts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"session_id" varchar(100),
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_downloads" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"order_item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"token" varchar(100) NOT NULL,
	"file_url" text NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"download_limit" integer,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "store_downloads_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "store_order_events" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"status" varchar(30) NOT NULL,
	"note" text,
	"actor" varchar(100) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text,
	"variant_id" text,
	"product_name" varchar(255) NOT NULL,
	"variant_name" varchar(255),
	"sku" varchar(100),
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"tax_rate" varchar(10),
	"is_digital" boolean DEFAULT false NOT NULL,
	"digital_file_url" text,
	"image" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "store_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"status" "store_order_status" DEFAULT 'pending' NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"shipping_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"payment_provider_id" varchar(50),
	"payment_transaction_id" text,
	"paid_at" timestamp,
	"shipping_address" jsonb,
	"billing_address" jsonb,
	"shipping_method" varchar(100),
	"tracking_number" varchar(255),
	"tracking_url" text,
	"shipped_at" timestamp,
	"delivered_at" timestamp,
	"discount_code" varchar(50),
	"customer_note" text,
	"admin_note" text,
	"invoice_number" varchar(50),
	"tax_details" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"cancelled_at" timestamp,
	"refunded_at" timestamp,
	CONSTRAINT "store_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_shipping_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"zone_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"rate_cents" integer NOT NULL,
	"free_above_cents" integer,
	"per_item_cents" integer DEFAULT 0,
	"min_weight_grams" integer,
	"max_weight_grams" integer,
	"estimated_days" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_shipping_zones" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"countries" jsonb NOT NULL,
	"regions" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_tax_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"country" varchar(2) NOT NULL,
	"state" varchar(100),
	"tax_class" varchar(50) DEFAULT 'standard' NOT NULL,
	"rate" numeric(5, 2) NOT NULL,
	"name" varchar(100) NOT NULL,
	"price_includes_tax" boolean DEFAULT true NOT NULL,
	"reverse_charge" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_characters" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"tagline" varchar(255),
	"system_prompt" text NOT NULL,
	"personality" text,
	"avatar_url" varchar(1024),
	"greeting" text,
	"gender_id" smallint,
	"sexuality_id" smallint,
	"ethnicity_id" smallint,
	"personality_id" smallint,
	"kink_id" smallint,
	"job_id" smallint,
	"hobbies" jsonb,
	"relationship_id" smallint,
	"hair_color_id" smallint,
	"hair_texture_id" smallint,
	"hair_style_id" smallint,
	"eyes_color_id" smallint,
	"skin_id" smallint,
	"body_description_id" smallint,
	"custom_negative" text,
	"model_preset" varchar(50),
	"lora_config" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"token_cost_multiplier" real DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "chat_characters_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"character_id" text NOT NULL,
	"title" varchar(255),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"last_message_at" timestamp,
	"message_count" integer DEFAULT 0 NOT NULL,
	"total_tokens_used" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_conversation_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"summary" text NOT NULL,
	"messages_from" timestamp NOT NULL,
	"messages_to" timestamp NOT NULL,
	"messages_covered" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"status" varchar(20) DEFAULT 'delivered' NOT NULL,
	"moderation_result" jsonb,
	"token_count" integer,
	"media_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_media" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"filename" varchar(255) NOT NULL,
	"filepath" varchar(1024) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"thumbnail_path" varchar(1024),
	"purpose" varchar(30) DEFAULT 'message' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"provider_type" varchar(20) DEFAULT 'llm' NOT NULL,
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
CREATE TABLE "chat_provider_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"provider_type" varchar(20) NOT NULL,
	"status" varchar(20) NOT NULL,
	"response_time_ms" integer,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_content_revisions" ADD CONSTRAINT "cms_content_revisions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_post_attachments" ADD CONSTRAINT "cms_post_attachments_post_id_cms_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."cms_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_post_attachments" ADD CONSTRAINT "cms_post_attachments_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_posts" ADD CONSTRAINT "cms_posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_media" ADD CONSTRAINT "cms_media_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_menu_items" ADD CONSTRAINT "cms_menu_items_menu_id_cms_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."cms_menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_audit_log" ADD CONSTRAINT "cms_audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_custom_field_values" ADD CONSTRAINT "cms_custom_field_values_field_definition_id_cms_custom_field_definitions_id_fk" FOREIGN KEY ("field_definition_id") REFERENCES "public"."cms_custom_field_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_form_submissions" ADD CONSTRAINT "cms_form_submissions_form_id_cms_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."cms_forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_comments" ADD CONSTRAINT "cms_comments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_reactions" ADD CONSTRAINT "cms_reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_user_preferences" ADD CONSTRAINT "cms_user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_notifications" ADD CONSTRAINT "saas_notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_projects" ADD CONSTRAINT "saas_projects_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_projects" ADD CONSTRAINT "saas_projects_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_webhook_deliveries" ADD CONSTRAINT "cms_webhook_deliveries_webhook_id_cms_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."cms_webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_payment_transactions" ADD CONSTRAINT "saas_payment_transactions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_discount_usages" ADD CONSTRAINT "saas_discount_usages_discount_code_id_saas_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."saas_discount_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_subscriptions" ADD CONSTRAINT "saas_subscriptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_token_balances" ADD CONSTRAINT "saas_token_balances_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_token_transactions" ADD CONSTRAINT "saas_token_transactions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_support_chat_messages" ADD CONSTRAINT "saas_support_chat_messages_session_id_saas_support_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."saas_support_chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_ticket_messages" ADD CONSTRAINT "saas_ticket_messages_ticket_id_saas_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."saas_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_tickets" ADD CONSTRAINT "saas_tickets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_affiliate_events" ADD CONSTRAINT "saas_affiliate_events_affiliate_id_saas_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."saas_affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_referrals" ADD CONSTRAINT "saas_referrals_affiliate_id_saas_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."saas_affiliates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_product_categories" ADD CONSTRAINT "store_product_categories_product_id_store_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."store_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_product_categories" ADD CONSTRAINT "store_product_categories_category_id_store_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."store_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_product_images" ADD CONSTRAINT "store_product_images_product_id_store_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."store_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_product_variants" ADD CONSTRAINT "store_product_variants_product_id_store_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."store_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_variant_groups" ADD CONSTRAINT "store_variant_groups_product_id_store_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."store_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_cart_items" ADD CONSTRAINT "store_cart_items_cart_id_store_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."store_carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_cart_items" ADD CONSTRAINT "store_cart_items_product_id_store_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."store_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_cart_items" ADD CONSTRAINT "store_cart_items_variant_id_store_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."store_product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_downloads" ADD CONSTRAINT "store_downloads_order_id_store_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."store_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_downloads" ADD CONSTRAINT "store_downloads_order_item_id_store_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."store_order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_order_events" ADD CONSTRAINT "store_order_events_order_id_store_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."store_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_order_items" ADD CONSTRAINT "store_order_items_order_id_store_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."store_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_shipping_rates" ADD CONSTRAINT "store_shipping_rates_zone_id_store_shipping_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."store_shipping_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_character_id_chat_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."chat_characters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversation_summaries" ADD CONSTRAINT "chat_conversation_summaries_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_provider_logs" ADD CONSTRAINT "chat_provider_logs_provider_id_chat_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."chat_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cms_content_revisions_type_id_idx" ON "cms_content_revisions" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE INDEX "cms_post_attachments_post_id_idx" ON "cms_post_attachments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "cms_post_attachments_file_type_idx" ON "cms_post_attachments" USING btree ("file_type");--> statement-breakpoint
CREATE INDEX "cms_post_attachments_deleted_at_idx" ON "cms_post_attachments" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_posts_type_lang_slug_uniq" ON "cms_posts" USING btree ("type","lang","slug");--> statement-breakpoint
CREATE INDEX "cms_posts_type_status_lang_idx" ON "cms_posts" USING btree ("type","status","lang");--> statement-breakpoint
CREATE INDEX "cms_posts_slug_lang_idx" ON "cms_posts" USING btree ("slug","lang");--> statement-breakpoint
CREATE INDEX "cms_posts_status_idx" ON "cms_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cms_posts_published_at_idx" ON "cms_posts" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "cms_posts_translation_group_idx" ON "cms_posts" USING btree ("translation_group");--> statement-breakpoint
CREATE INDEX "cms_posts_deleted_at_idx" ON "cms_posts" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cms_posts_author_id_idx" ON "cms_posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "cms_posts_created_at_idx" ON "cms_posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cms_posts_parent_id_idx" ON "cms_posts" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "cms_slug_redirects_lookup_idx" ON "cms_slug_redirects" USING btree ("old_slug","url_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_categories_slug_lang_uniq" ON "cms_categories" USING btree ("slug","lang");--> statement-breakpoint
CREATE INDEX "cms_categories_status_order_idx" ON "cms_categories" USING btree ("status","order");--> statement-breakpoint
CREATE INDEX "cms_categories_published_at_idx" ON "cms_categories" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "cms_categories_deleted_at_idx" ON "cms_categories" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cms_categories_translation_group_idx" ON "cms_categories" USING btree ("translation_group");--> statement-breakpoint
CREATE INDEX "cms_media_file_type_idx" ON "cms_media" USING btree ("file_type");--> statement-breakpoint
CREATE INDEX "cms_media_uploaded_by_id_idx" ON "cms_media" USING btree ("uploaded_by_id");--> statement-breakpoint
CREATE INDEX "cms_media_deleted_at_idx" ON "cms_media" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cms_media_created_at_idx" ON "cms_media" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_terms_taxonomy_slug_lang_uniq" ON "cms_terms" USING btree ("taxonomy_id","slug","lang");--> statement-breakpoint
CREATE INDEX "cms_terms_taxonomy_id_idx" ON "cms_terms" USING btree ("taxonomy_id");--> statement-breakpoint
CREATE INDEX "cms_terms_deleted_at_idx" ON "cms_terms" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cms_terms_status_order_idx" ON "cms_terms" USING btree ("status","order");--> statement-breakpoint
CREATE INDEX "cms_term_rel_object_id_idx" ON "cms_term_relationships" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "cms_term_rel_term_id_idx" ON "cms_term_relationships" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "cms_term_rel_taxonomy_id_idx" ON "cms_term_relationships" USING btree ("taxonomy_id");--> statement-breakpoint
CREATE INDEX "cms_menu_items_menu_id_idx" ON "cms_menu_items" USING btree ("menu_id");--> statement-breakpoint
CREATE INDEX "cms_menu_items_parent_order_idx" ON "cms_menu_items" USING btree ("menu_id","parent_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_menus_slug_uniq" ON "cms_menus" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cms_audit_log_entity_idx" ON "cms_audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "cms_audit_log_user_idx" ON "cms_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cms_audit_log_action_idx" ON "cms_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "cms_audit_log_created_at_idx" ON "cms_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cms_webhooks_active_idx" ON "cms_webhooks" USING btree ("active");--> statement-breakpoint
CREATE INDEX "cms_cfv_content_idx" ON "cms_custom_field_values" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE INDEX "cms_cfv_definition_idx" ON "cms_custom_field_values" USING btree ("field_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_cfv_unique_idx" ON "cms_custom_field_values" USING btree ("field_definition_id","content_type","content_id");--> statement-breakpoint
CREATE INDEX "cms_form_submissions_form_created_idx" ON "cms_form_submissions" USING btree ("form_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_portfolio_slug_lang_uniq" ON "cms_portfolio" USING btree ("slug","lang");--> statement-breakpoint
CREATE INDEX "cms_portfolio_status_idx" ON "cms_portfolio" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cms_portfolio_published_at_idx" ON "cms_portfolio" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "cms_portfolio_deleted_at_idx" ON "cms_portfolio" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cms_portfolio_translation_group_idx" ON "cms_portfolio" USING btree ("translation_group");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_showcase_slug_lang_uniq" ON "cms_showcase" USING btree ("slug","lang");--> statement-breakpoint
CREATE INDEX "cms_showcase_status_idx" ON "cms_showcase" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cms_showcase_sort_order_idx" ON "cms_showcase" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "cms_showcase_deleted_at_idx" ON "cms_showcase" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cms_showcase_translation_group_idx" ON "cms_showcase" USING btree ("translation_group");--> statement-breakpoint
CREATE INDEX "cms_comments_content_idx" ON "cms_comments" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE INDEX "cms_comments_parent_idx" ON "cms_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "cms_comments_deleted_idx" ON "cms_comments" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_reactions_user_content_uniq" ON "cms_reactions" USING btree ("user_id","content_type","content_id");--> statement-breakpoint
CREATE INDEX "cms_reactions_content_idx" ON "cms_reactions" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE INDEX "cms_translations_lang_to_idx" ON "cms_translations" USING btree ("lang_to");--> statement-breakpoint
CREATE INDEX "cms_translations_created_at_idx" ON "cms_translations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "saas_notifications_user_idx" ON "saas_notifications" USING btree ("user_id","read","created_at");--> statement-breakpoint
CREATE INDEX "saas_notifications_org_idx" ON "saas_notifications" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "saas_projects_org_idx" ON "saas_projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "saas_projects_deleted_idx" ON "saas_projects" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_task_queue_poll" ON "saas_task_queue" USING btree ("queue","status","run_after");--> statement-breakpoint
CREATE INDEX "idx_task_queue_stale" ON "saas_task_queue" USING btree ("status","locked_until");--> statement-breakpoint
CREATE INDEX "cms_webhook_deliveries_webhook_idx" ON "cms_webhook_deliveries" USING btree ("webhook_id","created_at");--> statement-breakpoint
CREATE INDEX "cms_webhook_deliveries_status_idx" ON "cms_webhook_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "saas_subscriptions_org_idx" ON "saas_subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "saas_subscriptions_status_org_idx" ON "saas_subscriptions" USING btree ("status","organization_id");--> statement-breakpoint
CREATE INDEX "saas_token_tx_org_idx" ON "saas_token_transactions" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_support_chat_messages_session" ON "saas_support_chat_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_support_chat_sessions_visitor" ON "saas_support_chat_sessions" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "idx_support_chat_sessions_user" ON "saas_support_chat_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_support_chat_sessions_status" ON "saas_support_chat_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ticket_messages_ticket" ON "saas_ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_tickets_org_status" ON "saas_tickets" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_tickets_assigned" ON "saas_tickets" USING btree ("assigned_to","status");--> statement-breakpoint
CREATE INDEX "idx_tickets_created" ON "saas_tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_affiliate_events" ON "saas_affiliate_events" USING btree ("affiliate_id","type","created_at");--> statement-breakpoint
CREATE INDEX "idx_referrals_affiliate" ON "saas_referrals" USING btree ("affiliate_id","status");--> statement-breakpoint
CREATE INDEX "idx_user_acquisitions_utm_source" ON "saas_user_acquisitions" USING btree ("utm_source");--> statement-breakpoint
CREATE INDEX "idx_user_acquisitions_ref_code" ON "saas_user_acquisitions" USING btree ("ref_code");--> statement-breakpoint
CREATE INDEX "idx_docs_slug" ON "cms_docs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_docs_section_order" ON "cms_docs" USING btree ("section","sort_order");--> statement-breakpoint
CREATE INDEX "idx_docs_parent" ON "cms_docs" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_docs_status" ON "cms_docs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_store_categories_slug" ON "store_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_store_categories_parent" ON "store_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_store_product_categories_product" ON "store_product_categories" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_store_product_categories_category" ON "store_product_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_store_product_images_product" ON "store_product_images" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_store_variants_product" ON "store_product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_store_variants_sku" ON "store_product_variants" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "idx_store_products_slug" ON "store_products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_store_products_status" ON "store_products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_store_products_type" ON "store_products" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_store_products_deleted" ON "store_products" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_store_variant_groups_product" ON "store_variant_groups" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_store_addresses_user" ON "store_addresses" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "idx_store_cart_items_cart" ON "store_cart_items" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "idx_store_carts_user" ON "store_carts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_store_carts_session" ON "store_carts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_store_downloads_token" ON "store_downloads" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_store_downloads_user" ON "store_downloads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_store_order_events_order" ON "store_order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_store_order_items_order" ON "store_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_store_orders_user" ON "store_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_store_orders_status" ON "store_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_store_orders_number" ON "store_orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "idx_store_orders_created" ON "store_orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_store_shipping_rates_zone" ON "store_shipping_rates" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "idx_store_tax_rates_country" ON "store_tax_rates" USING btree ("country","tax_class");--> statement-breakpoint
CREATE INDEX "idx_chat_characters_active" ON "chat_characters" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "idx_chat_characters_deleted" ON "chat_characters" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_chat_conv_user_status" ON "chat_conversations" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_chat_conv_user_last_msg" ON "chat_conversations" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "idx_chat_conv_character" ON "chat_conversations" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "idx_chat_conv_org" ON "chat_conversations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_chat_summary_conv" ON "chat_conversation_summaries" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_msg_conv_created" ON "chat_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_msg_conv_role" ON "chat_messages" USING btree ("conversation_id","role");--> statement-breakpoint
CREATE INDEX "idx_chat_media_user" ON "chat_media" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_chat_media_purpose" ON "chat_media" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "idx_chat_providers_status_priority" ON "chat_providers" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "idx_chat_provider_logs_provider" ON "chat_provider_logs" USING btree ("provider_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_provider_logs_created" ON "chat_provider_logs" USING btree ("created_at");