-- System bot identity row.
--
-- FU-12 (CP14 cluster): T64 promotes `User.id → portal_sub` across Fast's
-- product models. The system bot (AHABOT) authors routine-task spawns,
-- channel announcements, and audit-log lines; it needs a row in
-- identity_users so that — once T64's destructive User.id rewrite lands —
-- the bot's Fast User row can rebind to a real portal UUID without a
-- footnote on the "User.id IS a portal_sub" invariant.
--
-- The bot must never be loginable. Four independent gates enforce this:
--   1. status = 'inactive'      → password-signin.ts:156, routes/auth.ts:233/659,
--                                  employee-provisioning.ts:21 all reject
--   2. gip_uid IS NULL          → no Google identity ⇒ Workspace SSO has nothing
--                                  to resolve against
--   3. password_set_at IS NULL  → password sign-in's lookup-then-verify never
--                                  reaches the credential-check branch
--   4. No identity_user_emails  → OTP + password flows both resolve user by
--                                  emailNormalized first; without an email row
--                                  the user can't even be located by login code
--
-- `source = 'system'` is a new value added to IDENTITY_USER_SOURCES in
-- identity-users.ts (TS-only change; the DB column is plain varchar(20)
-- with no CHECK constraint). The value disambiguates the bot from
-- offboarded humans (which sit at status='inactive', source='manual') so
-- future admin lists / exports can filter `source != 'system'` cleanly.
--
-- Idempotent via ON CONFLICT — re-running db:migrate (or applying this
-- against a database that already received it via an earlier run) is a
-- no-op. Fast's lib/system-bot.ts pins the same UUID in its
-- SYSTEM_BOT_PORTAL_SUB constant; the two must stay in lockstep.

INSERT INTO "identity_users" (
  "id",
  "name",
  "portal_role",
  "has_google_workspace",
  "source",
  "status",
  "provisioning_status",
  "password_only_auth",
  "created_at",
  "updated_at"
)
VALUES (
  'b07b07b0-0000-4000-a000-000000000bb7',
  'AHABOT',
  'employee',
  false,
  'system',
  'inactive',
  'ready',
  false,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;
