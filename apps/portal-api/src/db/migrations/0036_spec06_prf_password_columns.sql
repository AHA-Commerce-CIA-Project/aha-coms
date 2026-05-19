ALTER TABLE "identity_users" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "identity_users" ADD COLUMN "password_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_users" ADD COLUMN "password_only_auth" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_users" ADD COLUMN "password_lockout_until" timestamp with time zone;