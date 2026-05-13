-- Hand-written to close a schema↔migration drift: src/core-payments/schema/payments.ts
-- defines `transaction_type` (enum) plus five auth/capture columns on
-- saas_payment_transactions, but no committed migration creates them, so a fresh
-- `bun run init` builds the table without those columns and the demo-transaction
-- seed (which writes `transactionType`) fails. This adds them.
--
-- Idempotent so a half-migrated DB recovers cleanly. The accompanying
-- drizzle/meta/0009_snapshot.json was hand-built to reflect this state (the 6
-- new columns + the saas_transaction_type enum, chained off 0008's snapshot),
-- so `db:generate` won't try to re-add them. (`db:generate` may still prompt
-- on *other* pre-existing column-rename ambiguities — that's a separate issue;
-- run it interactively to resolve and it'll write a proper 0010 snapshot.)
-- Verified: applies cleanly + idempotently against a fresh DB.
--
-- Existing-data note (PG version-dependent):
-- On Postgres 11+, `ADD COLUMN ... NOT NULL DEFAULT 'payment'::saas_transaction_type`
-- uses the fast-path (enum literal default is immutable) → constant time
-- regardless of row count. On PG < 11 it rewrites every row.
-- If you're targeting an older PG with a populated `saas_payment_transactions`,
-- split this into three steps for an online migration:
--   1) drop NOT NULL from this statement, run the migration,
--   2) backfill `transaction_type = 'payment'` in batches,
--   3) `ALTER TABLE saas_payment_transactions ALTER COLUMN transaction_type SET NOT NULL`.
-- On the fresh-DB path this migration was authored for, it's a no-op either way.

DO $$ BEGIN
  CREATE TYPE "public"."saas_transaction_type" AS ENUM('payment', 'authorization', 'capture', 'refund', 'void');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE "saas_payment_transactions" ADD COLUMN IF NOT EXISTS "transaction_type" "saas_transaction_type" DEFAULT 'payment' NOT NULL;--> statement-breakpoint
ALTER TABLE "saas_payment_transactions" ADD COLUMN IF NOT EXISTS "payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "saas_payment_transactions" ADD COLUMN IF NOT EXISTS "payment_method_id" text;--> statement-breakpoint
ALTER TABLE "saas_payment_transactions" ADD COLUMN IF NOT EXISTS "authorized_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "saas_payment_transactions" ADD COLUMN IF NOT EXISTS "captured_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "saas_payment_transactions" ADD COLUMN IF NOT EXISTS "authorization_expires_at" timestamp;
