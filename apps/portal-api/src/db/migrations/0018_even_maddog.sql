CREATE TABLE "member_app_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"app_role" varchar(50) NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_app_role_user_id_app_id_unique" UNIQUE("user_id","app_id")
);
--> statement-breakpoint
ALTER TABLE "member_app_role" ADD CONSTRAINT "member_app_role_user_id_identity_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_app_role" ADD CONSTRAINT "member_app_role_app_id_app_registry_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."app_registry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_app_role" ADD CONSTRAINT "member_app_role_granted_by_identity_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."identity_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Data migration: expand existing team-level roles into per-member rows
INSERT INTO "member_app_role" ("id", "user_id", "app_id", "app_role", "granted_by", "granted_at")
SELECT gen_random_uuid(), tm.user_id, ta.app_id, ta.app_role, ta.granted_by, ta.granted_at
FROM "team_app_access" ta
JOIN "team_members" tm ON tm.team_id = ta.team_id
WHERE ta.app_role IS NOT NULL
ON CONFLICT ("user_id", "app_id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "team_app_access" DROP COLUMN "app_role";