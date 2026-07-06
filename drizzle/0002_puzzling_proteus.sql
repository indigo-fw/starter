ALTER TABLE "saas_subscriptions" ADD COLUMN "last_grant_period_key" varchar(20);--> statement-breakpoint
ALTER TABLE "saas_token_balances" ADD COLUMN "plan_balance" integer DEFAULT 0 NOT NULL;