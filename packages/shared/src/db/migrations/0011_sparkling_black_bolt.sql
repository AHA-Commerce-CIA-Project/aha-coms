CREATE TABLE "alias_cache" (
	"alias_normalized" varchar(255) PRIMARY KEY NOT NULL,
	"alias_id" uuid NOT NULL,
	"portal_sub" uuid NOT NULL,
	"is_primary" boolean NOT NULL,
	"tombstoned" boolean DEFAULT false NOT NULL,
	"deactivated_at" timestamp with time zone,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deactivated_user_ingest_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" text NOT NULL,
	"sheet_row_number" integer NOT NULL,
	"portal_sub" uuid NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_cache" (
	"portal_sub" uuid PRIMARY KEY NOT NULL,
	"contact_email" varchar(255) NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "heroes_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"attendance_name" varchar(50),
	"branch_key" varchar(128),
	"branch_value_snapshot" varchar(255),
	"team_key" varchar(128),
	"team_value_snapshot" varchar(255),
	"department_key" varchar(128),
	"department_value_snapshot" varchar(255),
	"position" varchar(100),
	"phone" varchar(20),
	"employment_status" varchar(20),
	"talenta_id" varchar(50),
	"avatar_url" text,
	"locale_pref" varchar(10),
	"must_change_password" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_alias_resolution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" text NOT NULL,
	"sheet_row_number" integer NOT NULL,
	"raw_name" varchar(255) NOT NULL,
	"raw_name_normalized" varchar(255) NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_retry_at" timestamp with time zone,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy_cache" (
	"taxonomy_id" varchar(64) NOT NULL,
	"key" varchar(128) NOT NULL,
	"value" varchar(255) NOT NULL,
	"metadata" jsonb,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxonomy_cache_taxonomy_id_key_pk" PRIMARY KEY("taxonomy_id","key")
);
--> statement-breakpoint
CREATE TABLE "user_config_cache" (
	"portal_sub" uuid PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "branches" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "teams" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_emails" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "user" CASCADE;--> statement-breakpoint
DROP TABLE "branches" CASCADE;--> statement-breakpoint
DROP TABLE "teams" CASCADE;--> statement-breakpoint
DROP TABLE "user_emails" CASCADE;--> statement-breakpoint
DROP TABLE "users" CASCADE;--> statement-breakpoint
-- Wipe rows that reference dropped tables (pre-real-users posture; cutover plan truncates these anyway).
-- Required so the text->uuid type change on session/account succeeds and so the new FKs to
-- heroes_profiles validate against an empty (and therefore consistent) row set.
TRUNCATE TABLE
  "achievement_points",
  "appeals",
  "audit_logs",
  "challenges",
  "comments",
  "notifications",
  "point_summaries",
  "redemptions",
  "sheet_sync_jobs",
  "system_settings",
  "session",
  "account"
RESTART IDENTITY CASCADE;
--> statement-breakpoint
ALTER TABLE "account" DROP CONSTRAINT IF EXISTS "account_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "achievement_points" DROP CONSTRAINT IF EXISTS "achievement_points_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "achievement_points" DROP CONSTRAINT IF EXISTS "achievement_points_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "achievement_points" DROP CONSTRAINT IF EXISTS "achievement_points_submitted_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "achievement_points" DROP CONSTRAINT IF EXISTS "achievement_points_approved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "achievement_points" DROP CONSTRAINT IF EXISTS "achievement_points_revoked_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "appeals" DROP CONSTRAINT IF EXISTS "appeals_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "appeals" DROP CONSTRAINT IF EXISTS "appeals_appellant_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "appeals" DROP CONSTRAINT IF EXISTS "appeals_resolved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_actor_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "challenges" DROP CONSTRAINT IF EXISTS "challenges_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "challenges" DROP CONSTRAINT IF EXISTS "challenges_challenger_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "challenges" DROP CONSTRAINT IF EXISTS "challenges_resolved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "comments_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "comments_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "point_summaries" DROP CONSTRAINT IF EXISTS "point_summaries_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "point_summaries" DROP CONSTRAINT IF EXISTS "point_summaries_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "redemptions" DROP CONSTRAINT IF EXISTS "redemptions_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "redemptions" DROP CONSTRAINT IF EXISTS "redemptions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "redemptions" DROP CONSTRAINT IF EXISTS "redemptions_approved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "rewards" DROP CONSTRAINT IF EXISTS "rewards_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "sheet_sync_jobs" DROP CONSTRAINT IF EXISTS "sheet_sync_jobs_branch_id_branches_id_fk";
--> statement-breakpoint
ALTER TABLE "sheet_sync_jobs" DROP CONSTRAINT IF EXISTS "sheet_sync_jobs_started_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "system_settings" DROP CONSTRAINT IF EXISTS "system_settings_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "achievement_points" ALTER COLUMN "branch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appeals" ALTER COLUMN "branch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "branch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "challenges" ALTER COLUMN "branch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "branch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "branch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "point_summaries" ALTER COLUMN "branch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "redemptions" ALTER COLUMN "branch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sheet_sync_jobs" ALTER COLUMN "branch_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "alias_cache_portal_sub_idx" ON "alias_cache" USING btree ("portal_sub");--> statement-breakpoint
CREATE INDEX "idx_heroes_profiles_attendance_name" ON "heroes_profiles" USING btree ("attendance_name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_heroes_profiles_talenta_id" ON "heroes_profiles" USING btree ("talenta_id");--> statement-breakpoint
CREATE INDEX "idx_heroes_profiles_branch_key" ON "heroes_profiles" USING btree ("branch_key");--> statement-breakpoint
CREATE INDEX "idx_heroes_profiles_team_key" ON "heroes_profiles" USING btree ("team_key");--> statement-breakpoint
CREATE INDEX "idx_heroes_profiles_department_key" ON "heroes_profiles" USING btree ("department_key");--> statement-breakpoint
CREATE INDEX "pending_alias_raw_name_normalized_idx" ON "pending_alias_resolution" USING btree ("raw_name_normalized");--> statement-breakpoint
CREATE INDEX "pending_alias_status_idx" ON "pending_alias_resolution" USING btree ("status");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_heroes_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."heroes_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_points" ADD CONSTRAINT "achievement_points_user_id_heroes_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."heroes_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_points" ADD CONSTRAINT "achievement_points_submitted_by_heroes_profiles_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."heroes_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_points" ADD CONSTRAINT "achievement_points_approved_by_heroes_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."heroes_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_points" ADD CONSTRAINT "achievement_points_revoked_by_heroes_profiles_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."heroes_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_appellant_id_heroes_profiles_id_fk" FOREIGN KEY ("appellant_id") REFERENCES "public"."heroes_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_resolved_by_heroes_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."heroes_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_heroes_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."heroes_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_heroes_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."heroes_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_challenger_id_heroes_profiles_id_fk" FOREIGN KEY ("challenger_id") REFERENCES "public"."heroes_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_resolved_by_heroes_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."heroes_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_heroes_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."heroes_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_heroes_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."heroes_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_summaries" ADD CONSTRAINT "point_summaries_user_id_heroes_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."heroes_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_user_id_heroes_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."heroes_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_approved_by_heroes_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."heroes_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_sync_jobs" ADD CONSTRAINT "sheet_sync_jobs_started_by_heroes_profiles_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."heroes_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_heroes_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."heroes_profiles"("id") ON DELETE no action ON UPDATE no action;