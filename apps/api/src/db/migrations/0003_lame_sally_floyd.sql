ALTER TABLE "identity_users" ADD COLUMN "provisioning_status" varchar(20) DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_users" ADD COLUMN "provisioning_error" text;