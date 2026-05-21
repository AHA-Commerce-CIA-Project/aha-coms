-- Spec 07 Phase B / T2.3 — B-tree indexes for Task.requesterName,
-- Task.completedBy, TaskReview.reviewerType.
--
-- WHY CONCURRENT + WHY NOT db push
--
-- The `tasks` table exceeds 100k rows. Plain CREATE INDEX (what
-- `prisma db push` emits) acquires an AccessExclusiveLock for the
-- duration of the build — writes are blocked for the whole window,
-- which on a table this size can run tens of seconds. CREATE INDEX
-- CONCURRENTLY acquires only ShareUpdateExclusiveLock, allowing
-- concurrent reads and writes throughout; it takes longer but causes
-- no production downtime.
--
-- Prisma's `db push` cannot emit CONCURRENTLY. The workaround used
-- here is: pre-apply the indexes via this file using the
-- cloud-sql-proxy path, then declare @@index in schema.prisma. On
-- the next deploy, db push sees the indexes already satisfy the
-- @@index declarations and does nothing. The schema declaration is
-- the authoritative record; this file is the one-time manual step.
--
-- Index names are Prisma's default pattern (<ModelName>_<field>_idx)
-- so the @@index declarations in schema.prisma need no map: argument —
-- Prisma's introspection sees the same name and considers the
-- constraint already satisfied.
--
-- Apply order: operator runs this file statement-by-statement via
-- cloud-sql-proxy before merging this PR. Then merge, deploy; db push
-- on the deployed revision is a no-op for these three indexes.
--
-- Operator runbook (full detail in this PR's body).
--
-- No BEGIN/COMMIT — CONCURRENTLY cannot run inside a transaction.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_requesterName_idx"
  ON "tasks" ("requester_name");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Task_completedBy_idx"
  ON "tasks" ("completed_by");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "TaskReview_reviewerType_idx"
  ON "task_reviews" ("reviewer_type");
