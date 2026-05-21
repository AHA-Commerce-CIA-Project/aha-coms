-- Spec 07 Phase B / T2.1 (gap-close) — pg_trgm extension + GIN trigram indexes
--   on portal-api ilike-flagged columns (DB Perf Audit 2026-05-20, Non-sargable rule).
--
-- OPERATOR APPLY ONLY — do NOT let drizzle-kit migrate run this file automatically.
-- These indexes must be created CONCURRENTLY (outside any transaction) via
-- cloud-sql-proxy + psql. See the PR body for the exact runbook.
--
-- Why CONCURRENTLY: identity_users and identity_user_emails exceed the ~100k-row
-- threshold flagged in Spec 07 §6 "Ask first". CONCURRENTLY avoids write-locking
-- production during index build. Cloud SQL for Postgres supports CONCURRENTLY.
--
-- Why no BEGIN/COMMIT: CREATE INDEX CONCURRENTLY is rejected inside a transaction
-- block. Each statement below must run in its own implicit transaction (one psql
-- \i invocation per statement, or separated by \; with autocommit on).
--
-- Why no Drizzle schema-side declaration: Drizzle's index() builder in drizzle-orm
-- 0.45.x emits the operator class only as a bare column name — gin_trgm_ops cannot
-- be cleanly expressed via index().using('gin', col) without a raw sql`…` wrapper
-- that db:generate would then wrap in BEGIN/COMMIT, making CONCURRENTLY fail.
-- Spec 07 §4 explicitly carves this out: "Phase 2 raw migrations for pg_trgm GIN
-- indexes which Prisma/Drizzle can't model natively."
-- Future db:generate runs will not see these indexes and will not attempt to drop them
-- (the generator only tracks indexes it created from schema declarations).
--
-- Why this file is numbered 0039 but is NOT in _journal.json: db:migrate only
-- applies files listed in the journal. This file is intentionally absent from the
-- journal to prevent drizzle-kit from wrapping the CONCURRENTLY statements inside
-- a transaction. Apply manually via the operator runbook; verify via pg_stat_user_indexes.
-- (0038 is reserved for the B-tree idx_identity_users_status + idx_teams_name_lower
-- migration in PR #100, which lands in the same operator window.)
--
-- Columns indexed and why:
--   identity_users.name          — ilike search in routes/employees.ts:71, :172 and
--                                   routes/admin/app-config.ts:86
--   identity_user_emails.email_normalized — ilike search in routes/employees.ts:158
--   identity_user_emails.email   — ilike search in routes/admin/app-config.ts:87
--   user_aliases.alias_normalized — T2.5 (B-PR-6) rewrites aliases.ts:172 from
--                                   JS Levenshtein to pg_trgm similarity(); GIN
--                                   on this column is the prerequisite.
--
-- Sibling migrations:
--   packages/heroes-shared/src/db/migrations/0019_pg_trgm_gin.sql (PR #99) —
--     same pg_trgm extension (idempotent IF NOT EXISTS) + heroes-shared GIN indexes.
--   apps/portal-api/src/db/migrations/0038_*.sql (PR #100) —
--     B-tree indexes idx_identity_users_status + idx_teams_name_lower (not GIN).
--
-- teams.name is NOT indexed here: the ilike at employee-info-sync.ts:243 is a
-- whole-value case-insensitive lookup (not a contains/substring search) that T2.4
-- will rewrite to eq(lower(teams.name), …). The B-tree functional index on
-- lower(teams.name) added by PR #100 covers T2.4's rewrite; a GIN here would be
-- redundant dead weight once T2.4 lands.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- identity_users.name — ilike search in routes/employees.ts:71, :172 and routes/admin/app-config.ts:86
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_identity_users_name_gin_trgm
  ON "identity_users" USING GIN ("name" gin_trgm_ops);

-- identity_user_emails.email_normalized — ilike search in routes/employees.ts:158
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_identity_user_emails_email_normalized_gin_trgm
  ON "identity_user_emails" USING GIN ("email_normalized" gin_trgm_ops);

-- identity_user_emails.email — ilike search in routes/admin/app-config.ts:87
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_identity_user_emails_email_gin_trgm
  ON "identity_user_emails" USING GIN ("email" gin_trgm_ops);

-- user_aliases.alias_normalized — prerequisite for T2.5 (aliases.ts similarity rewrite)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_aliases_alias_normalized_gin_trgm
  ON "user_aliases" USING GIN ("alias_normalized" gin_trgm_ops);
