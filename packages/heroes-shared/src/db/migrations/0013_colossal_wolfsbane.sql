ALTER TABLE "heroes_profiles" ADD COLUMN "role" varchar(32) DEFAULT 'employee' NOT NULL;--> statement-breakpoint
-- Backfill role from the legacy user_config_cache.config.role projection so
-- existing users retain their admin/captain/member assignment after the read
-- path switches off user_config_cache. Falls back to 'employee' (the column
-- default) when no cached role exists or the JSON path is missing.
UPDATE "heroes_profiles" hp
SET "role" = COALESCE(ucc."config" ->> 'role', 'employee')
FROM "user_config_cache" ucc
WHERE ucc."portal_sub" = hp."id"
  AND ucc."config" ? 'role';
