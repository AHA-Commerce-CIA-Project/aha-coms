CREATE TABLE "org_taxonomies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taxonomy_id" varchar(64) NOT NULL,
	"key" varchar(128) NOT NULL,
	"value" varchar(255) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "app_manifests" ADD COLUMN "taxonomies" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "org_taxonomies" ADD CONSTRAINT "org_taxonomies_updated_by_identity_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."identity_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_taxonomies_taxonomy_key_uniq" ON "org_taxonomies" USING btree ("taxonomy_id","key");--> statement-breakpoint
CREATE INDEX "org_taxonomies_taxonomy_id_idx" ON "org_taxonomies" USING btree ("taxonomy_id");--> statement-breakpoint
-- Spec 07 seed: copy current branch + department values from identity_users into org_taxonomies.
-- key == value initially (free-text legacy strings); admin can refine display values via /admin/taxonomies (PR 07-2).
-- Teams seeded empty: portal has no enumerable team taxonomy today (apps/api/src/db/schema/teams.ts is membership groups, not branch-teams).
-- Admin must populate `org_taxonomies` where taxonomy_id='teams' from Heroes' production team table BEFORE Heroes Deploy A
-- (see TODO-spec-07-08-cutover.md cutover window pre-flight).
INSERT INTO "org_taxonomies" ("taxonomy_id", "key", "value")
SELECT 'branches', branch, branch
FROM (SELECT DISTINCT "branch" AS branch FROM "identity_users" WHERE "branch" IS NOT NULL AND "branch" <> '') s
ON CONFLICT ("taxonomy_id", "key") DO NOTHING;--> statement-breakpoint
INSERT INTO "org_taxonomies" ("taxonomy_id", "key", "value")
SELECT 'departments', department, department
FROM (SELECT DISTINCT "department" AS department FROM "identity_users" WHERE "department" IS NOT NULL AND "department" <> '') s
ON CONFLICT ("taxonomy_id", "key") DO NOTHING;--> statement-breakpoint
-- Mark Heroes' manifest as taxonomy-aware so subsequent registerManifest() calls don't have to.
UPDATE "app_manifests"
SET "taxonomies" = '["branches","teams","departments"]'::jsonb,
    "schema_version" = GREATEST("schema_version", 2)
WHERE "app_id" = (SELECT "id" FROM "app_registry" WHERE "slug" = 'heroes' LIMIT 1);