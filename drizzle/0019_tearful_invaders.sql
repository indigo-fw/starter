ALTER TABLE "user" ADD COLUMN "state" varchar(50);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "timezone" varchar(50);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "preferred_currency" varchar(3);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_ip" varchar(45);