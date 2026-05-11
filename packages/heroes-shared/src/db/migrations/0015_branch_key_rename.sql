-- Rename branch_id (uuid) → branch_key (varchar(128)) across 10 tables.
--
-- The portal taxonomy contract (coms_portal/apps/api/src/routes/taxonomies.ts)
-- returns string keys (e.g. 'indonesia'), never UUIDs. The original `uuid`
-- column type was a misalignment that made every sheet-sync resync fail
-- with PG cast error 22P02 ('invalid input syntax for type uuid: …') the
-- moment getDefaultBranchKey returned the literal taxonomy key it had
-- cached. heroes_profiles.branch_key is already varchar(128); this
-- migration brings every other branch-scoped table in line.
--
-- Session variable `app.current_branch_id` is also renamed to
-- `app.current_branch_key` and the ::UUID cast removed from every RLS
-- policy that referenced it. repositories/base.ts must change in lock-
-- step (handled in the same commit).

-- ── 1. Drop RLS policies that reference branch_id ──────────────────
DROP POLICY IF EXISTS "rewards_select" ON "rewards";--> statement-breakpoint
DROP POLICY IF EXISTS "ap_branch_isolation" ON "achievement_points";--> statement-breakpoint
DROP POLICY IF EXISTS "challenges_branch_isolation" ON "challenges";--> statement-breakpoint
DROP POLICY IF EXISTS "appeals_branch_isolation" ON "appeals";--> statement-breakpoint
DROP POLICY IF EXISTS "comments_branch_isolation" ON "comments";--> statement-breakpoint
DROP POLICY IF EXISTS "redemptions_branch_isolation" ON "redemptions";--> statement-breakpoint
DROP POLICY IF EXISTS "audit_select" ON "audit_logs";--> statement-breakpoint
DROP POLICY IF EXISTS "ps_branch_isolation" ON "point_summaries";--> statement-breakpoint

-- ── 2. Drop indexes on branch_id ───────────────────────────────────
DROP INDEX IF EXISTS "idx_points_branch";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_points_branch_created";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_points_branch_user";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_appeals_branch";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_audit_branch";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_challenges_branch";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_comments_branch";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_notifications_branch";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_point_summaries_leaderboard_bintang";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_point_summaries_branch_user";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_redemptions_branch";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_rewards_branch";--> statement-breakpoint

-- ── 3. Rename + retype branch_id → branch_key (USING NULL wipes any
--      stale UUID values; current data is null almost everywhere
--      because portal-bootstrap has never succeeded) ────────────────
ALTER TABLE "achievement_points" RENAME COLUMN "branch_id" TO "branch_key";--> statement-breakpoint
ALTER TABLE "achievement_points" ALTER COLUMN "branch_key" SET DATA TYPE varchar(128) USING NULL;--> statement-breakpoint
ALTER TABLE "appeals" RENAME COLUMN "branch_id" TO "branch_key";--> statement-breakpoint
ALTER TABLE "appeals" ALTER COLUMN "branch_key" SET DATA TYPE varchar(128) USING NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" RENAME COLUMN "branch_id" TO "branch_key";--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "branch_key" SET DATA TYPE varchar(128) USING NULL;--> statement-breakpoint
ALTER TABLE "challenges" RENAME COLUMN "branch_id" TO "branch_key";--> statement-breakpoint
ALTER TABLE "challenges" ALTER COLUMN "branch_key" SET DATA TYPE varchar(128) USING NULL;--> statement-breakpoint
ALTER TABLE "comments" RENAME COLUMN "branch_id" TO "branch_key";--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "branch_key" SET DATA TYPE varchar(128) USING NULL;--> statement-breakpoint
ALTER TABLE "notifications" RENAME COLUMN "branch_id" TO "branch_key";--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "branch_key" SET DATA TYPE varchar(128) USING NULL;--> statement-breakpoint
ALTER TABLE "point_summaries" RENAME COLUMN "branch_id" TO "branch_key";--> statement-breakpoint
ALTER TABLE "point_summaries" ALTER COLUMN "branch_key" SET DATA TYPE varchar(128) USING NULL;--> statement-breakpoint
ALTER TABLE "redemptions" RENAME COLUMN "branch_id" TO "branch_key";--> statement-breakpoint
ALTER TABLE "redemptions" ALTER COLUMN "branch_key" SET DATA TYPE varchar(128) USING NULL;--> statement-breakpoint
ALTER TABLE "rewards" RENAME COLUMN "branch_id" TO "branch_key";--> statement-breakpoint
ALTER TABLE "rewards" ALTER COLUMN "branch_key" SET DATA TYPE varchar(128) USING NULL;--> statement-breakpoint
ALTER TABLE "sheet_sync_jobs" RENAME COLUMN "branch_id" TO "branch_key";--> statement-breakpoint
ALTER TABLE "sheet_sync_jobs" ALTER COLUMN "branch_key" SET DATA TYPE varchar(128) USING NULL;--> statement-breakpoint

-- ── 4. Recreate indexes against branch_key ─────────────────────────
CREATE INDEX "idx_points_branch" ON "achievement_points" USING btree ("branch_key");--> statement-breakpoint
CREATE INDEX "idx_points_branch_created" ON "achievement_points" USING btree ("branch_key","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_points_branch_user" ON "achievement_points" USING btree ("branch_key","user_id");--> statement-breakpoint
CREATE INDEX "idx_appeals_branch" ON "appeals" USING btree ("branch_key");--> statement-breakpoint
CREATE INDEX "idx_audit_branch" ON "audit_logs" USING btree ("branch_key");--> statement-breakpoint
CREATE INDEX "idx_challenges_branch" ON "challenges" USING btree ("branch_key");--> statement-breakpoint
CREATE INDEX "idx_comments_branch" ON "comments" USING btree ("branch_key");--> statement-breakpoint
CREATE INDEX "idx_notifications_branch" ON "notifications" USING btree ("branch_key");--> statement-breakpoint
CREATE INDEX "idx_point_summaries_leaderboard_bintang" ON "point_summaries" USING btree ("branch_key","bintang_count");--> statement-breakpoint
CREATE INDEX "idx_point_summaries_branch_user" ON "point_summaries" USING btree ("branch_key","user_id");--> statement-breakpoint
CREATE INDEX "idx_redemptions_branch" ON "redemptions" USING btree ("branch_key");--> statement-breakpoint
CREATE INDEX "idx_rewards_branch" ON "rewards" USING btree ("branch_key");--> statement-breakpoint

-- ── 5. Recreate RLS policies — branch_key compared as text, no
--      UUID cast on the session variable ──────────────────────────
CREATE POLICY "rewards_select" ON "rewards"
    FOR SELECT
    USING (
        branch_key IS NULL
        OR current_setting('app.current_role', true) = 'admin'
        OR branch_key = current_setting('app.current_branch_key', true)
    );--> statement-breakpoint

CREATE POLICY "ap_branch_isolation" ON "achievement_points"
    USING (
        current_setting('app.current_role', true) = 'admin'
        OR branch_key = current_setting('app.current_branch_key', true)
    );--> statement-breakpoint

CREATE POLICY "challenges_branch_isolation" ON "challenges"
    USING (
        current_setting('app.current_role', true) = 'admin'
        OR branch_key = current_setting('app.current_branch_key', true)
    );--> statement-breakpoint

CREATE POLICY "appeals_branch_isolation" ON "appeals"
    USING (
        current_setting('app.current_role', true) = 'admin'
        OR branch_key = current_setting('app.current_branch_key', true)
    );--> statement-breakpoint

CREATE POLICY "comments_branch_isolation" ON "comments"
    USING (
        current_setting('app.current_role', true) = 'admin'
        OR branch_key = current_setting('app.current_branch_key', true)
    );--> statement-breakpoint

CREATE POLICY "redemptions_branch_isolation" ON "redemptions"
    USING (
        current_setting('app.current_role', true) = 'admin'
        OR branch_key = current_setting('app.current_branch_key', true)
    );--> statement-breakpoint

CREATE POLICY "audit_select" ON "audit_logs"
    FOR SELECT
    USING (
        current_setting('app.current_role', true) = 'admin'
        OR (current_setting('app.current_role', true) = 'hr'
            AND branch_key = current_setting('app.current_branch_key', true))
    );--> statement-breakpoint

CREATE POLICY "ps_branch_isolation" ON "point_summaries"
    USING (
        current_setting('app.current_role', true) = 'admin'
        OR branch_key = current_setting('app.current_branch_key', true)
    );--> statement-breakpoint

-- ── 6. Wipe the stale taxonomy_cache seed that shadowed any portal-
--      supplied entries (getDefaultBranchKey did SELECT … LIMIT 1
--      without ORDER BY, so this row could win indefinitely). The
--      portal-bootstrap, now reachable via PORTAL_BASE_URL set in
--      deploy.yml, will repopulate on the next cold start. ──────────
DELETE FROM "taxonomy_cache" WHERE "taxonomy_id" = 'branches' AND "key" = 'Indonesia';
