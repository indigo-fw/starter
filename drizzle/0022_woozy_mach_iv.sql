CREATE TYPE "public"."store_product_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."store_product_type" AS ENUM('simple', 'variable', 'digital', 'subscription');--> statement-breakpoint
CREATE TYPE "public"."store_order_status" AS ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');--> statement-breakpoint
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
	"model" varchar(100),
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
CREATE INDEX "idx_chat_media_purpose" ON "chat_media" USING btree ("purpose");