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
--   cloud-sql-proxy --port 5433 fbi-dev-484410:asia-southeast2:<inst>
--   psql "postgres://...@localhost:5433/<db>" -f 0001_add_portal_sub.sql
--
-- Equivalent to `prisma db push` against the schema change in
-- prisma/schema.prisma; this file is the auditable source-of-truth
-- SQL for the change (fast's deploy workflow uses `db push` today,
-- which does not generate migration files — T80's Phase 8 work
-- decides whether fast switches to Drizzle's migrate-on-deploy shape
-- per ADR 0011's reopen criteria, or stays on `db push`).
--
-- Why a regular UNIQUE constraint, not a partial unique index:
--   This file's original 2026-05-13 authorship used a partial unique
--   index — `CREATE UNIQUE INDEX … WHERE portal_sub IS NOT NULL` —
--   on the theory that the partial form was "more honest" about the
--   nullable column. The two forms are equivalent for the data-
--   integrity invariant (Postgres treats multiple NULL values as
--   distinct in a regular UNIQUE constraint, allowing many NULL rows
--   while enforcing uniqueness among non-NULL values), but they are
--   NOT equivalent for Prisma's `upsert`: Prisma generates
--   `INSERT … ON CONFLICT ("portal_sub") DO UPDATE`, which Postgres
--   resolves against an index whose conflict_target is exactly
--   `("portal_sub")` with NO WHERE clause. A partial index requires
--   the conflict spec to repeat its filter — `ON CONFLICT (portal_sub)
--   WHERE portal_sub IS NOT NULL` — which Prisma does not emit. The
--   result on 2026-05-14: every call into loadFastAuthUser's upsert
--   returned 42P10 ("no unique or exclusion constraint matching the
--   ON CONFLICT specification") and `/fast/api/auth/me` 500'd in prod
--   throughout the chrome-mount window. The hotfix swapped the partial
--   index for a regular unique constraint of the same name (zero data
--   move; the swap holds the existing rows' uniqueness guarantee
--   identically). This file now mirrors what should have landed at
--   original authorship; the Prisma schema's `portal_sub String?
--   @unique` declarative form generates exactly this shape via
--   `prisma db push`.

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "portal_sub" varchar(255);

-- Drop the partial unique index (named user_portal_sub_key) if it
-- exists from a prior application of this file's earlier authorship.
DROP INDEX IF EXISTS "user_portal_sub_key";

-- Add the regular UNIQUE constraint Prisma's @unique declaration
-- expects. ADD CONSTRAINT auto-creates an index of the same name;
-- the IF NOT EXISTS pattern doesn't exist for constraints, but
-- re-applying this file is safe because DROP INDEX above clears
-- any prior shape first, and a duplicate constraint name would
-- error out clearly rather than silently mis-applying.
ALTER TABLE "user"
  ADD CONSTRAINT "user_portal_sub_key" UNIQUE ("portal_sub");
