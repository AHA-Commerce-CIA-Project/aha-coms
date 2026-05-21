-- Spec 07 Phase B / T2.1 (apps/fast portion)
--
-- Installs the pg_trgm extension and creates GIN trigram indexes on every
-- column in fast's Prisma DB that is searched via Prisma's `{ contains: …,
-- mode: 'insensitive' }` (the ILIKE equivalent). Without these indexes every
-- such query degrades to a full sequential scan — catastrophic on the three
-- known >100k-row tables: tasks, channel_messages, and activity_logs.
--
-- Columns indexed (model → db table → column):
--   ActivityLog  → activity_logs    → description
--   Channel      → channels         → name
--   Task         → tasks            → title
--   ChannelMessage → channel_messages → content
--   ThreadReply  → thread_replies   → content
--   Team         → teams            → name   (static fallback lookup in
--                                             /api/request but still ilike)
--
-- NOTE: Task.taskToken (task_token) is NOT indexed here. The audit flagged
-- it as a non-sargable ilike site, but Spec 07 T2.6 / B-PR-7 rewrites
-- /api/search to `{ startsWith: q }` (a B-tree-sargable prefix scan).
-- Adding a GIN index now and then removing it in B-PR-7 is wasted churn;
-- leave task_token to B-PR-7.
--
-- NOTE: schema.prisma is NOT touched in this PR. Prisma cannot model
-- `gin_trgm_ops` via @@index(type: Gin) — the operator is unsupported by
-- Prisma's DSL. The raw SQL file is the source of truth; Prisma's
-- introspection (`db pull`) will see these indexes exist in the DB but will
-- not track them in schema.prisma. That is expected and acceptable per
-- Spec 07 §3 / T2.1 acceptance criteria.
--
-- Apply via cloud-sql-proxy + psql (see Operator runbook in the PR body).
-- No BEGIN/COMMIT — each statement is its own implicit transaction, which is
-- required for CREATE INDEX CONCURRENTLY (cannot run inside an explicit txn).
--
-- Rollback: DROP INDEX CONCURRENTLY for each index (see PR body).

-- ──────────────────────────────────────────────────────────────────────────
-- Extension
-- ──────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ──────────────────────────────────────────────────────────────────────────
-- ActivityLog.description  (activity_logs)
-- Hot path: /api/activity-log?search=… — leader dashboard text search
-- ──────────────────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_logs_description_gin_trgm
  ON "activity_logs" USING GIN ("description" gin_trgm_ops);

-- ──────────────────────────────────────────────────────────────────────────
-- Channel.name  (channels)
-- Hot path: /api/search?q=… — global omnibar channel search
--           /api/request  — static team-name fallback lookup
-- ──────────────────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_channels_name_gin_trgm
  ON "channels" USING GIN ("name" gin_trgm_ops);

-- ──────────────────────────────────────────────────────────────────────────
-- Task.title  (tasks)
-- Hot path: /api/search?q=… — global omnibar task search
-- ──────────────────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_title_gin_trgm
  ON "tasks" USING GIN ("title" gin_trgm_ops);

-- ──────────────────────────────────────────────────────────────────────────
-- ChannelMessage.content  (channel_messages)
-- Hot path: /api/channels/[channelId]/search?q=… — in-channel message search
-- ──────────────────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_channel_messages_content_gin_trgm
  ON "channel_messages" USING GIN ("content" gin_trgm_ops);

-- ──────────────────────────────────────────────────────────────────────────
-- ThreadReply.content  (thread_replies)
-- Hot path: /api/channels/[channelId]/search?q=… — in-channel reply search
-- ──────────────────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_thread_replies_content_gin_trgm
  ON "thread_replies" USING GIN ("content" gin_trgm_ops);

-- ──────────────────────────────────────────────────────────────────────────
-- Team.name  (teams)
-- Path: /api/request — static fallback: find "Factual Business Intelligence"
--        team by name when no mentionHandle match; low-frequency but ilike
-- ──────────────────────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teams_name_gin_trgm
  ON "teams" USING GIN ("name" gin_trgm_ops);
