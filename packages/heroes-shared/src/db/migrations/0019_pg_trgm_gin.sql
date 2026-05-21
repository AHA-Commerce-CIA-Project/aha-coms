-- Spec 07 Phase B / T2.1 — pg_trgm extension + GIN trigram indexes on heroes-shared
--   ilike-flagged columns (DB Perf Audit 2026-05-20, Non-sargable rule).
--
-- OPERATOR APPLY ONLY — do NOT let drizzle-kit migrate run this file automatically.
-- These indexes must be created CONCURRENTLY (outside any transaction) via
-- cloud-sql-proxy + psql. See the PR body for the exact runbook.
--
-- Why CONCURRENTLY: the five target tables (heroes_profiles, achievement_points,
-- rewards, taxonomy_cache) include heroes_profiles and achievement_points which
-- exceed the ~100k-row threshold flagged in §6 "Ask first". CONCURRENTLY avoids
-- write-locking production during index build.
--
-- Why no BEGIN/COMMIT: CREATE INDEX CONCURRENTLY is rejected inside a transaction
-- block. Each statement below must run in its own implicit transaction (one psql
-- \i invocation per statement, or separated by \; with autocommit on).
--
-- Why no Drizzle schema-side declaration: Drizzle's index() builder passes the
-- operator class to the SQL generator only as a column name — the gin_trgm_ops
-- operator class cannot be cleanly expressed via index().using('gin', col) without
-- raw sql`…` that Drizzle's migration generator would then wrap in BEGIN/COMMIT,
-- making CONCURRENTLY fail. Spec 07 §4 explicitly carves this out: "Phase 2 raw
-- migrations for pg_trgm GIN indexes which Prisma/Drizzle can't model natively."
-- Future db:generate runs will therefore not see these indexes and will not attempt
-- to drop them (the generator only tracks indexes it created from schema declarations).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- heroes_profiles.name — ilike search in heroes-api/repositories/users.ts:39
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_heroes_profiles_name_gin_trgm
  ON "heroes_profiles" USING GIN ("name" gin_trgm_ops);

-- heroes_profiles.position — ilike search in heroes-api/repositories/users.ts:42
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_heroes_profiles_position_gin_trgm
  ON "heroes_profiles" USING GIN ("position" gin_trgm_ops);

-- achievement_points.reason — ilike search in heroes-api/repositories/points.ts:28
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_achievement_points_reason_gin_trgm
  ON "achievement_points" USING GIN ("reason" gin_trgm_ops);

-- rewards.name — ilike search in heroes-api/repositories/redemptions.ts:37
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rewards_name_gin_trgm
  ON "rewards" USING GIN ("name" gin_trgm_ops);

-- taxonomy_cache.value — ilike search in heroes-api/repositories/teams.ts:21
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_taxonomy_cache_value_gin_trgm
  ON "taxonomy_cache" USING GIN ("value" gin_trgm_ops);
