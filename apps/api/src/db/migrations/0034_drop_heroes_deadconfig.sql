-- Drop dead config from Heroes' configSchema.
--
-- `leaderboard_eligible` and `starting_points` were declared in Heroes'
-- manifest configSchema but never consumed by Heroes-side code:
--   * leaderboard.ts (packages/server/src/services/leaderboard.ts) filters
--     only on heroes_profiles.{branchKey, isActive, teamKey} — no eligibility
--     or starting_points reference anywhere in the repo.
--   * Both knobs appeared only in test fixtures and the now-deleted static
--     services/manifests/heroes.json (removed in fb3b3ac, Spec 03d D12).
--
-- Empty the configSchema rather than delete the app_manifests row so the
-- manifest still exists with schemaVersion + taxonomies intact — future
-- knobs can be added by updating this row without re-registering the app.
-- app_user_config currently holds zero rows, so no per-user data is lost.

UPDATE "app_manifests"
SET "config_schema" = '{}'::jsonb,
    "updated_at" = now()
WHERE "app_id" = (SELECT "id" FROM "app_registry" WHERE "slug" = 'heroes' LIMIT 1);
