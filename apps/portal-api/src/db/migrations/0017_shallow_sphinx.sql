ALTER TABLE "app_registry" ADD COLUMN "health_status" varchar(20) DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_registry" ADD COLUMN "last_health_check_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_registry" ADD COLUMN "last_health_error" text;