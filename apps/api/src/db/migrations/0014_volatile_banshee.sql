ALTER TABLE "app_registry" ADD COLUMN "app_roles" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "team_app_access" ADD COLUMN "app_role" varchar(50);