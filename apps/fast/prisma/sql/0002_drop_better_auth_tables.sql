-- Spec 05 Phase 3 / T64 — sub-phase (c) destructive cut.
--
-- Drops the three Better Auth tables and the `email_verified` column
-- on `user`. Portal owns sessions (auth_sessions on the portal side);
-- fast no longer reads or writes here. The PK promotion of
-- `portal_sub` is intentionally NOT in this file — it waits for the
-- operator backfill (apps/fast/scripts/backfill-portal-sub.ts) to
-- confirm every active user has a non-null portal_sub. Until then
-- User.id stays the Better-Auth-issued string id and the 38 product
-- FK relations resolve unchanged.
--
-- Apply order is deploy-first-then-migrate, per the integration
-- contract's destructive-migration rule:
--
--   1. Deploy fast's new revision (Prisma schema has no Session /
--      Account / Verification models; client emits no queries against
--      those tables; emailVerified writes retired across the 4 writer
--      sites).
--   2. Run this file against the fast DB via Cloud SQL Auth Proxy.
--   3. Verify the dropped tables are gone and emailVerified column
--      no longer exists; reads against `user` continue to return rows.
--
-- The runbook (per T60's pattern):
--   cloud-sql-proxy --port 5433 fbi-dev-484410:asia-southeast1:<inst>
--   psql "postgres://aha-fast-admin:<pw>@localhost:5433/aha-fast-db" \
--     -f apps/fast/prisma/sql/0002_drop_better_auth_tables.sql
--   psql "..." -c "SELECT to_regclass('session'), to_regclass('account'), to_regclass('verification');"
--   -- Expect three NULLs.
--
-- Rollback shape: re-create the three tables from
-- apps/fast/prisma/schema.prisma's pre-T64 revision via git checkout
-- + `prisma db push`. No data restore is required because the tables
-- carried only Better-Auth-session state (not product data).

DROP TABLE IF EXISTS "session" CASCADE;
DROP TABLE IF EXISTS "account" CASCADE;
DROP TABLE IF EXISTS "verification" CASCADE;

ALTER TABLE "user"
  DROP COLUMN IF EXISTS "emailVerified";
