-- Spec 05 Phase 3 / T60 — sub-phase (a)
--
-- Adds the portal_sub bridge column to fast's User table. Nullable +
-- unique so the column lands without breaking existing rows; the
-- backfill script (apps/fast/scripts/backfill-portal-sub.ts) populates
-- it from portal's identity_user_emails table. T64 (sub-phase c)
-- promotes this column to NOT NULL + PRIMARY KEY once every active
-- user is migrated.
--
-- Apply order: dev → staging → prod via Cloud SQL Auth Proxy:
--   gcloud auth login
--   cloud-sql-proxy --port 5433 fbi-dev-484410:asia-southeast1:<inst>
--   psql "postgres://...@localhost:5433/<db>" -f 0001_add_portal_sub.sql
--
-- Equivalent to `prisma db push` against the schema change in
-- prisma/schema.prisma; this file is the auditable source-of-truth
-- SQL for the change (fast's deploy workflow uses `db push` today,
-- which does not generate migration files — T80's Phase 8 work
-- decides whether fast switches to Drizzle's migrate-on-deploy shape
-- per ADR 0011's reopen criteria, or stays on `db push`).

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "portal_sub" varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS "user_portal_sub_key"
  ON "user" ("portal_sub")
  WHERE "portal_sub" IS NOT NULL;
