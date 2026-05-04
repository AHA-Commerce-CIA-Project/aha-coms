CREATE INDEX "idx_points_branch_user" ON "achievement_points" USING btree ("branch_id","user_id");
--> statement-breakpoint
-- Drop the fn_sync_point_summary trigger and function.
-- This trigger referenced the `users` table (dropped in migration 0011).
-- Point-summary materialization is now owned entirely by application code
-- (recalculatePointSummaries in sheet-sync.ts), which runs after each full sync
-- using heroes_profiles as the identity source. The DB trigger is redundant and broken.
DROP TRIGGER IF EXISTS trg_sync_point_summary ON achievement_points;
--> statement-breakpoint
DROP FUNCTION IF EXISTS fn_sync_point_summary();
--> statement-breakpoint
-- Also drop the users-table updated_at trigger that referenced the now-dropped table.
-- The teams table trigger was already dropped with DROP TABLE teams CASCADE in 0011.
DROP TRIGGER IF EXISTS trg_updated_at ON users;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_updated_at ON teams;