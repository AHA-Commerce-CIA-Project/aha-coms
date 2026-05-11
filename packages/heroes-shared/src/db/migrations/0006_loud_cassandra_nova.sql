ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "employment_status" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "talenta_id" varchar(50);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_talenta_id" ON "users" USING btree ("talenta_id");