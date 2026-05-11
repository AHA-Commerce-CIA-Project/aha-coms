CREATE TABLE "identity_user_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_user_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_normalized" varchar(255) GENERATED ALWAYS AS (lower(trim("email"))) STORED NOT NULL,
	"kind" varchar(20) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"added_by" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_user_emails_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"former_identity_user_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_normalized" varchar(255) GENERATED ALWAYS AS (lower(trim("email"))) STORED NOT NULL,
	"kind" varchar(20) NOT NULL,
	"added_by" varchar(20) NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	"removed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_by" uuid,
	"removed_reason" varchar(50) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_user_id" uuid NOT NULL,
	"auth_method" varchar(20) NOT NULL,
	"email_used" varchar(255),
	"device_label" varchar(255),
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" varchar(30)
);
--> statement-breakpoint
ALTER TABLE "identity_users" DROP CONSTRAINT "identity_users_email_unique";--> statement-breakpoint
ALTER TABLE "identity_user_emails" ADD CONSTRAINT "identity_user_emails_identity_user_id_identity_users_id_fk" FOREIGN KEY ("identity_user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_user_emails_history" ADD CONSTRAINT "identity_user_emails_history_removed_by_identity_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."identity_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_identity_user_id_identity_users_id_fk" FOREIGN KEY ("identity_user_id") REFERENCES "public"."identity_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_user_emails_normalized_uniq" ON "identity_user_emails" USING btree ("email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_user_emails_one_primary_per_user_uniq" ON "identity_user_emails" USING btree ("identity_user_id") WHERE "identity_user_emails"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "identity_user_emails_identity_user_id_idx" ON "identity_user_emails" USING btree ("identity_user_id");--> statement-breakpoint
CREATE INDEX "identity_user_emails_kind_idx" ON "identity_user_emails" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "identity_user_emails_history_email_idx" ON "identity_user_emails_history" USING btree ("email_normalized");--> statement-breakpoint
CREATE INDEX "identity_user_emails_history_former_user_idx" ON "identity_user_emails_history" USING btree ("former_identity_user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_identity_user_id_idx" ON "auth_sessions" USING btree ("identity_user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_active_idx" ON "auth_sessions" USING btree ("identity_user_id","expires_at") WHERE "auth_sessions"."revoked_at" IS NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION fn_identity_user_emails_tombstone() RETURNS trigger AS $$
BEGIN
  INSERT INTO identity_user_emails_history (
    former_identity_user_id, email, kind, added_by, added_at, removed_at, removed_by, removed_reason
  ) VALUES (
    OLD.identity_user_id, OLD.email, OLD.kind, OLD.added_by, OLD.created_at, NOW(), NULL, 'admin_action'
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_identity_user_emails_tombstone
  BEFORE DELETE ON identity_user_emails
  FOR EACH ROW EXECUTE FUNCTION fn_identity_user_emails_tombstone();
--> statement-breakpoint
-- Backfill identity_user_emails from existing identity_users.email (workspace) and personal_email
INSERT INTO identity_user_emails (identity_user_id, email, kind, is_primary, verified_at, added_by)
SELECT id, email,
       CASE WHEN has_google_workspace THEN 'workspace' ELSE 'personal' END AS kind,
       TRUE AS is_primary,
       NOW() AS verified_at,
       'backfill' AS added_by
FROM identity_users
WHERE email IS NOT NULL;
--> statement-breakpoint
INSERT INTO identity_user_emails (identity_user_id, email, kind, is_primary, verified_at, added_by)
SELECT id, personal_email,
       'personal' AS kind,
       (NOT has_google_workspace) AS is_primary, -- only primary if no workspace email
       NOW() AS verified_at,
       'backfill' AS added_by
FROM identity_users
WHERE personal_email IS NOT NULL
  AND personal_email != email; -- avoid duplicating the email column row when has_google_workspace=false
--> statement-breakpoint
ALTER TABLE "identity_users" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "identity_users" DROP COLUMN "personal_email";
