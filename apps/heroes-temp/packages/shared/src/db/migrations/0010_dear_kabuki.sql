ALTER TABLE "session" ADD COLUMN "portal_role" text DEFAULT 'employee' NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "apps" text[] DEFAULT ARRAY[]::text[] NOT NULL;
