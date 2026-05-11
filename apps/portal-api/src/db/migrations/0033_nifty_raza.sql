ALTER TABLE "app_manifests" ALTER COLUMN "schema_version" SET DEFAULT 2;
--> statement-breakpoint
-- PR 07-5: every registered app must declare schemaVersion >= 2. Forward-fill
-- any rows still on v1 (or anything below 2) to the new minimum.
UPDATE "app_manifests" SET "schema_version" = 2 WHERE "schema_version" < 2;