-- _backfill_marker was a temporary annotation added to user-aliases.ts to force
-- drizzle-kit generate to author a journal entry for migration 0024 (the
-- backfill INSERT...SELECT, per CLAUDE.md data-only migration trick). The SQL
-- body of 0024 was replaced before apply, so the column was never created in
-- the database. IF EXISTS makes this a safe no-op against any DB.
ALTER TABLE "user_aliases" DROP COLUMN IF EXISTS "_backfill_marker";
