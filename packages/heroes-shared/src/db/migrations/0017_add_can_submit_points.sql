-- Spec 02 Phase 5 / T45 — promote canSubmitPoints out of user_config_cache.
--
-- Spec 02 §22 (re-grounded by T44's audit, see tasks/todo.md) asked which
-- pieces of the per-app config slice belong on the heroes-owned table. The
-- audit found canSubmitPoints is the only key actually read at every authed
-- request (loadHeroesAuthUser:165 → AuthUser → services/points.ts) — every
-- other key in user_config_cache.config is either duplicated already
-- (role → heroes_profiles.role since 0013_colossal_wolfsbane) or has zero
-- readers (leaderboard_eligible, starting_points). This migration adds the
-- column and backfills it; T46's follow-up drops the cache table entirely
-- once the read paths land.
--
-- Same shape as 0013_colossal_wolfsbane.sql's role backfill: add the new
-- column with a safe default, then COALESCE values out of the JSONB blob
-- for existing rows. Heroes treats canSubmitPoints as a permission knob, so
-- the conservative default for users with no cached entry is `false` (the
-- column default) — opt-in, not opt-out.
--
-- Apply order at deploy mirrors T36: heroes-api new revision deploys
-- first (the new code writes both the cache and the column during the
-- cutover window — handle-app-config-updated keeps the cache write until
-- T46 drops the table); operator runs `bun db:migrate` against prod via
-- Cloud SQL Auth Proxy second.

ALTER TABLE "heroes_profiles" ADD COLUMN "can_submit_points" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "heroes_profiles" hp
SET "can_submit_points" = COALESCE((ucc."config" ->> 'canSubmitPoints')::boolean, false)
FROM "user_config_cache" ucc
WHERE ucc."portal_sub" = hp."id"
  AND ucc."config" ? 'canSubmitPoints';
