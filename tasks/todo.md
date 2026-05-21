# Task List: Spec 07 + Spec 08 + Spec 09 + Spec 05 Carry-overs + Spec 06 Doc Reconciliation

> Last updated: 2026-05-20. Prior task list archived at `tasks/archive/2026-05-20-snapshot.todo.md`. Read `tasks/plan.md` first for the dependency graph + checkpoints.

## Status markers

- `[ ]` — Open
- `[~]` — In progress (a commit or partial work landed; full acceptance not yet met)
- `[x]` — Done (with anchor commit SHA inline)

## How to pick up a task

1. Read `tasks/plan.md` (full read; it's short)
2. Read the task's parent spec (`docs/spec/07-*.md` or `docs/spec/08-*.md` or for carry-overs, `tasks/archive/2026-05-20-snapshot.todo.md` for the historical FU/Finding context)
3. Confirm current state: `git log --oneline -10`, `git status`
4. Walk only the task you're picking up — don't pre-read every task

## Persona reminder

- portal-api / portal-web / heroes-api / heroes-web / packages — **Mr. Door** (see `~/.claude/skills/mr-door/`)
- **apps/fast — plain technical English** with four trailers: `Confidence`, `Scope-risk`, `Tested`, `Related` (per `apps/fast/CLAUDE.md`)
- Neither persona ever appends `Co-Authored-By: Claude` or `🤖 Generated with [Claude Code]`

---

## SPEC 07 — DATABASE PERFORMANCE REMEDIATION

Read `docs/spec/07-database-performance-remediation.md` for the full audit context + the rulebook each task closes.

### Phase A: Code-only fixes — Critical N+1s (parallelizable; 1 PR per task)

- [x] (e5e1317) **T1.1: Fix N+1 — `apps/portal-api/src/routes/employees.ts:179-187`** (Critical)
  - Rule: N+1 query in employee list/detail loader
  - Acceptance: batched query returns equivalent shape; new test asserts exactly one DB call to the employees model; `bun --filter @coms-portal/portal-api typecheck && test` green; audit rerun against this file:line produces no finding for this rule
  - Verification: type-check + test + audit rerun

- [x] (e5e1317; test typecheck-fix be2076a) **T1.2: Fix N+1 — `apps/portal-api/src/routes/access.ts:128-145`** (Critical)
  - Rule: N+1 in access-cleanup loop
  - Acceptance: rewrite as single `db.execute(sql\`DELETE ... NOT EXISTS ...\`)` keeping the NOT EXISTS guard inside the single statement (race-safe per Spec 07 §4); new test covers the batched call counts
  - Verification: type-check + test + audit rerun

- [x] (e5e1317) **T1.3: Fix N+1 — `apps/portal-api/src/services/teams.ts:50-67`** (Critical)
  - Rule: N+1 in team membership lookups
  - Acceptance: single batched query; race-safe atomic semantics preserved if applicable
  - Verification: type-check + test + audit rerun

- [x] (e5e1317) **T1.4: Fix N+1 — `apps/portal-api/src/services/teams.ts:21-27`** (Critical)
  - Rule: N+1 in team enumeration
  - Acceptance: batched fetch; downstream callsites unchanged
  - Verification: type-check + test + audit rerun

- [x] (e5e1317) **T1.5: Fix N+1 — `apps/portal-api/src/services/taxonomies.ts:210-220`** (Critical)
  - Rule: N+1 in taxonomy expansion
  - Acceptance: batched fetch via `in()` or `inArray()` predicate
  - Verification: type-check + test + audit rerun

- [x] (e5e1317; line 227 deferred to T2.4) **T1.6: Fix N+1 + Dup — `apps/portal-api/src/services/employee-info-sync.ts:213,227`** (Critical)
  - Rule: N+1 AND duplicate-query pattern
  - Acceptance: single batched fetch; memoise the duplicate read; line 227's `eq(teams.name, …)` is left intact — its sargable rewrite is T2.4 (Phase B, depends on T2.2)
  - Verification: type-check + test + audit rerun

- [x] (fced927) **T1.7: Fix N+1 — `apps/heroes-api/src/services/{redemptions,approval}.ts`** (Critical)
  - Rule: N+1 in batch redemption + approval handlers
  - Acceptance: single status UPDATE statement + single audit-log INSERT per batch; test with `ids.length === 3` confirms the assertion
  - Verification: type-check + test + audit rerun

- [x] (fced927) **T1.8: Fix N+1 — `apps/heroes-api/src/services/{challenges,appeals}.ts`** (Critical)
  - Rule: N+1 in challenges + appeals batch variants
  - Acceptance: mirror T1.7's shape — single UPDATE + single audit INSERT per batch
  - Verification: type-check + test + audit rerun

- [x] (31182fe) **T1.12: Fix N+1 — `apps/fast/app/api/chat/conversations/route.ts:71-83`** (Critical)
  - Rule: N+1 — groupBy unread counts loaded per conversation
  - Acceptance: Prisma `groupBy` or single batched count query; response shape preserved byte-identical
  - Persona: plain technical English commit per `apps/fast/CLAUDE.md`; consider `[skip-db-push]` in first line if no Prisma schema change
  - Verification: type-check + lint + test + audit rerun

- [x] (31182fe) **T1.13: Fix N+1 — `apps/fast/app/api/tasks/[id]/complete/route.ts:50-66`** (Critical)
  - Rule: N+1 in milestone updates
  - **Race-safety pin** (Spec 07 §4): the `claimedById: null` guard MUST stay inside the single UPDATE WHERE clause — batching with the guard outside introduces a TOCTOU window
  - Acceptance: Prisma `updateMany({ where: { id: { in: ids }, claimedById: null }, data: {...} })`; test with 3 ids confirms single-statement
  - Persona: plain technical English commit; `[skip-db-push]` first line
  - Verification: type-check + lint + test + audit rerun

- [x] (31182fe) **T1.14: Fix N+1 — `apps/fast/app/api/orbit/analytics/route.ts:73-100`** (Critical)
  - Rule: N+1 in orbit analytics aggregation
  - Acceptance: Prisma `groupBy` with the aggregation moved to the DB
  - Persona: plain technical English commit; `[skip-db-push]` first line
  - Verification: type-check + lint + test + audit rerun

- [x] (31182fe) **T1.15: Fix N+1 — `apps/fast/app/api/admin/sync-hr/route.ts:80-86, 89-109`** (Critical)
  - Rule: N+1 — two N+1 sites (the team lookup AND the per-employee upsert loop)
  - Acceptance: `createMany({ skipDuplicates: true })` for inserts; `updateMany` for updates; single team-lookup query before the loop; the team `select` projection is also a Medium fix bundled here per the spec table
  - Persona: plain technical English commit; `[skip-db-push]` first line if no schema change
  - Verification: type-check + lint + test + audit rerun

### Phase A: Code-only fixes — High severity (parallelizable)

- [x] (fced927) **T1.9: Fix correlated subquery — `apps/heroes-api/src/repositories/teams.ts:25-30`** (High)
  - Rule: correlated subquery → group-by
  - Acceptance: rewrite as single SELECT with GROUP BY; EXPLAIN ANALYZE before/after in PR body (non-obvious fix per Spec 07 §5)
  - Verification: type-check + test + audit rerun

- [x] (fced927) **T1.10: Add pagination — `apps/heroes-api/src/repositories/teams.ts:getTeamMembers`** (High)
  - Rule: row over-fetch — unbounded `getTeamMembers`
  - Acceptance: add `limit` + `offset` params; default limit 50, max 200; test requests page 2 with `limit=5` and asserts both honored
  - Verification: type-check + test + audit rerun

- [x] (verified-already-shipped; test-locked via e5e1317) **T1.11: Fix row over-fetch — `apps/portal-api/src/routes/teams.ts:14-25`** (High)
  - Rule: over-fetch — selects entire team rows when only a projection is needed
  - Acceptance: explicit Drizzle `.select({ ...only-needed-columns })`; only list columns the immediate caller reads downstream (Spec 07 §4); response builder re-adds any field a projection drops
  - Verification: type-check + test + audit rerun

### Phase A: Code-only fixes — Medium + Low (bundled)

- [x] (verified-already-shipped; helper consumed by T1.1 in e5e1317) **T1.16: Memoise + project — `apps/portal-api/src/services/email-resolution.ts`** (Medium — Dup + Column)
  - Rule: duplicate query + column over-fetch
  - Acceptance: introduce `getDisplayEmailsForUsers(ids: string[]): Promise<Map<string, string>>`; callers use the Map; new test asserts callsite produces the Map
  - Verification: type-check + test + audit rerun

- [x] (31182fe) **T1.17: Misc Mediums — fast** (Medium, bundled)
  - Surfaces: `apps/fast/app/api/channels/search/*` consolidation; `apps/fast/app/api/admin/sync-hr/route.ts` team `select` projection (overlaps T1.15 — may land together); `apps/fast/app/api/chat/users/*` + `apps/fast/app/api/orbit/templates/*` pagination
  - Acceptance: each surface's specific Medium finding closes; one PR bundling related Mediums is acceptable
  - Persona: plain technical English commit; `[skip-db-push]` first line
  - Verification: type-check + lint + test + audit rerun

- [x] (6579eb0) **T1.18: Defensive `.limit()` defenders bundle** (Low, single PR)
  - Surfaces:
    - `apps/portal-api/src/routes/apps.ts:70`
    - `apps/portal-api/src/services/manifests-internal.ts:246` (`loadAllManifests`)
    - `apps/heroes-api/src/repositories/settings.ts:10` (`getAllSettings`)
  - Acceptance: each call gains a `.limit(N)` with a justified ceiling (e.g., 200 for `loadAllManifests`); the cap is documented inline as a `// defensive` comment block
  - Verification: type-check + test + audit rerun

### Phase B: Migrations + index-dependent (gated by Phase A)

> **Operator coordination required** per Spec 07 §6 *Ask first* — `pg_trgm` GIN index creation on `achievement_points`, `identity_users`, `identity_user_emails`, `heroes_profiles`, `tasks`, `ChannelMessage`, `ActivityLog` (>100k rows) takes minutes and locks writes. Schedule before merging. Default to NOT skipping `db:push`.

- [ ] **T2.1: pg_trgm + GIN indexes on heroes-shared + fast search columns** (High)
  - File: `packages/heroes-shared/src/db/migrations/*.sql` (raw SQL — pg_trgm GIN unmodelable by Drizzle); `apps/fast/prisma/sql/*.sql` (raw SQL — Prisma can't model pg_trgm GIN natively)
  - Acceptance: `CREATE EXTENSION IF NOT EXISTS pg_trgm`; GIN indexes on the ilike-search columns enumerated in the audit; verification query against `pg_stat_user_indexes` confirms each new index exists
  - Operator coordination: schedule the apply window; consider `CREATE INDEX CONCURRENTLY` where supported
  - Verification: migration applied locally against seeded DB; CI re-runs migrations; rerun audit shows ilike sites now have GIN coverage

- [ ] **T2.2: Add `idx_identity_users_status`, `idx_teams_name_lower` to portal-api schema** (High)
  - File: `apps/portal-api/src/db/schema/identity-users.ts` (add `index()` declarations); generated SQL committed alongside
  - Acceptance: Drizzle `index()` declarations; `bun run --filter @coms-portal/portal-api db:generate` emits the migration; verification query against `pg_stat_user_indexes` confirms both indexes
  - Verification: type-check + test + index existence + audit rerun

- [ ] **T2.3: Add `@@index` on `Task.requesterName`, `Task.completedBy`, `TaskReview.reviewerType`** (High)
  - File: `apps/fast/prisma/schema.prisma`
  - Acceptance: three `@@index` declarations; `bun run --filter @coms-portal/fast db:push` applies them; verification query confirms existence
  - Persona: plain technical English commit; **must NOT carry `[skip-db-push]`** (Phase B needs db-push to run)
  - Verification: type-check + lint + test + audit rerun

- [ ] **T2.4: Rewrite `apps/portal-api/src/services/employee-info-sync.ts:227` → `eq(lower(teams.name), …)`** (High; depends on T2.2)
  - Rule: non-sargable predicate now backed by the functional index from T2.2
  - Acceptance: SQL plan uses the `idx_teams_name_lower` index (EXPLAIN ANALYZE in PR body); behavior unchanged
  - Verification: type-check + test + audit rerun

- [ ] **T2.5: Replace JS Levenshtein with pg_trgm similarity — `apps/portal-api/src/services/aliases.ts:172`** (High; depends on T2.1)
  - Rule: row over-fetch + non-sargable — JS-side fuzzy match required loading the whole table
  - Acceptance: rewrite as `SELECT ... WHERE similarity(name, $q) > $threshold ORDER BY similarity DESC LIMIT N`; the JS Levenshtein dependency removed; test covers the rewritten path
  - Verification: type-check + test + audit rerun

- [ ] **T2.6: Rewrite fast search → `taskToken: { startsWith: q }` — `apps/fast/app/api/search/route.ts:51`** (High)
  - Rule: non-sargable — current pattern doesn't use a trigram index even after T2.1
  - Acceptance: Prisma `taskToken: { startsWith: q }` uses the B-tree prefix index naturally; existing search behavior preserved
  - Persona: plain technical English commit; `[skip-db-push]` first line
  - Verification: type-check + lint + test + audit rerun

- [ ] **T2.7: Verification pass — rerun audit, confirm all ilike sites have GIN coverage** (Audit gate; depends on T2.1, T2.3)
  - Acceptance: rerun the rulebook against the full Spec 07 file:line list = zero findings; record the verification output in the PR body
  - Verification: this PR carries no code change; it's the gate that closes CHECKPOINT B

---

## SPEC 05 CARRY-OVERS

Read `tasks/archive/2026-05-20-snapshot.{plan,todo}.md` for the historical CP21 walk + Finding F1–F14 context.

### Phase C: Deferred from CP21 walk

- [ ] **C.1: T64 — User.id → portal_sub PK promotion** (own operator window)
  - Surface: `apps/fast/prisma/schema.prisma`'s `User.id` carries portal-issued UUIDs for every row, cascading through 38 product-model FK relations
  - Alternative path per integration contract §2: rename `User` → `fast_profiles`; choose at implementation time
  - Folds in **C.2 (FU-12)**: bot row re-keyed to `b07b07b0-0000-4000-a000-000000000bb7` portal UUID (portal-side seed landed via commit `929274a`)
  - Acceptance: `loadFastAuthUser` still upserts cleanly post-promotion; 38 FKs cascade with zero orphaned rows; `bun run --filter @coms-portal/fast typecheck` exit 0; smoke walk against `apps/fast/docs/smoke-checklist.md` green
  - Persona: plain technical English commit; **must NOT carry `[skip-db-push]`** (destructive migration must run)
  - Risk: tracked at HIGH — 38 FKs is a real cascade. Own operator window. Capture a `pg_dump` snapshot pre-apply
  - Verification: type-check + test + smoke walk + bot operations resolve

- [ ] **C.3: F2 — `portal_code` / `portal_redirect_to` URL litter on `/fast/*`**
  - Surface: auth-broker exchange handler unbuilt on fast; query params litter the browser URL after login
  - Options at implementation time:
    - (a) Author the exchange handler that strips params + `history.replaceState`s a clean URL
    - (b) Document explicitly in `apps/fast/docs/smoke-checklist.md` that fast intentionally diverges from heroes' shape
  - Acceptance: either the URL surfaces clean after login, or the divergence is documented as intentional
  - Persona: plain technical English commit
  - Verification: visual smoke through `/fast` login flow

- [ ] **C.4: F5 — "AHA COMSS" legacy brand strings (9 sites)**
  - Surface: replace `AHA COMSS` → `AHA COMS` across the 9 sites the CP21 walk surfaced
  - Acceptance: `grep -rn 'AHA COMSS' apps/ packages/` returns zero hits; visual sweep of TopNav + Sidebar + login pages confirms no remaining instances; no test relying on the exact string broken
  - Persona: plain technical English commit (single mechanical sweep)
  - Verification: grep + visual smoke

- [ ] **C.5: F9 — `CalendarMeetingSection.tsx:158` history.replaceState basePath drift**
  - File: `apps/fast/components/CalendarMeetingSection.tsx:158`
  - Surface: `history.replaceState` writes a URL that doesn't account for the `/fast` basePath (sibling to F4/F8 already mended in commit `a1f4557`)
  - Acceptance: `replaceState` writes a basePath-aware URL; visual smoke through `/fast/profile?tab=integrations` confirms; no regression in the Google Calendar reconnect round-trip
  - Persona: plain technical English commit
  - Verification: visual smoke + type-check

- [ ] **C.6: F11 — `/fast/request` mobile-viewport overflow**
  - File: `apps/fast/app/request/`
  - Surface: single-page cosmetic — horizontal scroll on mobile viewport 375×667
  - Acceptance: page renders at 375×667 without horizontal scroll; visual diff against `/fast/track` mobile shape (audits 100% clean) confirms parity
  - Persona: plain technical English commit
  - Verification: visual smoke at 375×667 + 414×896 viewports

- [ ] **C.7: F14 — portal-web PWA installability**
  - Files: `apps/portal-web/static/manifest.webmanifest`, `apps/portal-web/static/sw.js`
  - Surface: Android Chrome shows "Add Shortcut" not "Install" for portal-web (heroes + fast both install cleanly)
  - Likely cause: manifest missing a required field (`start_url`, `display`, `icons` per Web App Manifest spec), or service-worker scope misaligned
  - Acceptance: Android Chrome address-bar overflow menu shows "Install"; installed PWA opens standalone (no browser chrome); Lighthouse PWA audit ≥90
  - Persona: Mr. Door (portal-web)
  - Verification: on-device install test + Lighthouse audit

---

## SPEC 06 DOC RECONCILIATION

### Phase D: Flip stale markers

- [x] (175bc73; this very commit's predecessor on the same branch) **D.1: Flip 28 stale `[ ]` markers in `docs/spec/06-portal-password-auth.md`**
  - Surface: PR F shipped to prod through commits `eb13d13` → `cd5d593` → `7d65a72` → `ba83444` → `f1e143e`. Spec doc still carries `[ ]` on Success criteria lines 43-58 and Phase 1-5 tasks T01-T15 (excluding T10 + T10a which were correctly flipped)
  - Acceptance: every `[ ]` in `06-portal-password-auth.md` flipped to `[x]` with the satisfying commit SHA cited inline (e.g., `[x] (eb13d13)`); FU-14's verification clause re-run end-to-end:
    1. Admin creates `test@anywhere.com` via `/admin/identities`
    2. `identity_users` row carries `source = 'manual'`, `password_only_auth = TRUE`, `password_set_at IS NOT NULL`
    3. `identity_user_emails` row carries `kind = 'personal'`, `addedBy = 'admin'`
    4. `POST /api/auth/password/sign-in` with that credential succeeds
    5. Reaching a `/fast/*` page through `loadFastAuthUser` provisions a fast User row
  - Persona: Mr. Door (docs/spec/* edit)
  - Verification: doc diff + verification run output captured in commit body

---

## SPEC 08 — JWT STATELESS SESSIONS

Read `docs/spec/08-jwt-stateless-sessions.md` for full design. Gated by Phase B (Spec 07 must seal first — Spec 08's win is measured against a sane DB-perf baseline).

### Phase F: JWT migration delivering ADR 0005

- [ ] **F.1 + F.2: JWT minting + SDK verification primitive** (single PR — useless apart)
  - F.1: extend `apps/portal-api/src/services/sessions.ts` to mint JWTs alongside the existing `auth_sessions` insert; sign with portal's GIP service-account credential (RS256); payload `{ sub, name, email, portalRole, apps, authMethod, passwordSetupRequired, iat, exp }`; TTL 8 hours; `__session` cookie value becomes the JWT
  - F.2: author `sdk.auth.verifyRequest(req)` in `packages/sdk/src/auth/verify-request.ts` (new); reads cookie; verifies signature against `PORTAL_JWT_PUBLIC_KEY`; checks expiry; checks revocation list (F.6 dependency — initially stub returns false)
  - Acceptance: mint + verify round-trip test green; expired token rejected; invalid signature rejected; opaque-UUID cookie (legacy) returns null
  - Persona: Mr. Door (portal-api + sdk)
  - Verification: type-check + test workspace-wide

- [ ] **F.3: Swap portal-api auth middleware** (dual-path during migration)
  - File: `apps/portal-api/src/middleware/auth.ts:106`
  - Acceptance: SDK verification first; fallback to `validateSession(sessionId)` against `auth_sessions` for backwards-compat; emit `legacy_session_validate` counter (Cloud Monitoring custom metric)
  - Persona: Mr. Door
  - Verification: type-check + test + counter wired

- [ ] **F.4: Swap `loadHeroesAuthUser` + `loadFastAuthUser`** (dual-path)
  - Files: `packages/heroes-shared/src/auth/user.ts:88` (heroes), `apps/fast/lib/auth/load-fast-auth-user.ts` (fast)
  - Acceptance: local SDK verification first; fallback to `fetch('/api/userinfo')` for pre-migration cookies; both SSR rendering paths unchanged
  - Persona: Mr. Door for heroes-shared; plain technical English for fast
  - Verification: type-check + test + manual smoke (fresh-login JWT + DevTools-injected legacy cookie)

- [ ] **F.5: Swap portal-web SSR**
  - File: `apps/portal-web/src/hooks.server.ts:70-75`
  - Acceptance: SDK verification first; in-process `validateSession` fallback (cheap, same process); per-request DB query count for session validation drops by 1 measured via `pg_stat_statements` or app-side counter
  - Persona: Mr. Door
  - Verification: type-check + test + before/after DB query count

- [ ] **F.6: Revocation list + SDK helper**
  - Files: portal-api Drizzle migration adding `portal_revoked_subs`; portal-api route `GET /api/auth/revoked-subs?since=<iso>`; SDK helper `sdk.auth.isSubRevoked(sub)` with in-memory cache (TTL `JWT_REVOCATION_TTL_SECONDS`, default 60)
  - Surface: Spec 06 PR E's sign-out-everywhere (`apps/portal-api/src/routes/employees.ts:821`) now writes to `portal_revoked_subs` alongside its existing `auth_sessions` revocation
  - Acceptance: admin signs out a user; within ≤60s every web surface rejects the user's JWT (verify in stage env or local with TTL=5s for speed)
  - Persona: Mr. Door
  - Verification: type-check + test + cross-app smoke

- [ ] **F.7: Migration window — observe `legacy_session_validate` = 0 for 7 days**
  - No code change for this task — operator monitoring via Cloud Monitoring
  - Acceptance: 7 consecutive days at zero across all surfaces; fallback paths removed in a follow-up cleanup PR (kept `validateSession` itself for session-creation paths + `/api/me/sessions` panel)
  - Verification: monitoring dashboard snapshot in PR body

- [ ] **F.8: ADR 0005 addendum**
  - File: `docs/adr/0005-jwt-stateless-sessions.md`
  - Acceptance: dated addendum: "Resolution delivered via Spec 08. Sessions are now JWTs minted by portal-api, verified locally via `@coms-portal/sdk`. The opaque-UUID intermediate state (T31's resolution) survives only for new-session row records and the sessions-management UX. Revocation propagates within `JWT_REVOCATION_TTL_SECONDS` (default 60s) via the portal-served revoked-subs list."
  - Persona: Mr. Door
  - Verification: doc diff + ADR cross-references updated

---

## SPEC 09 — SSE LISTEN/NOTIFY FANOUT

Read `docs/spec/09-sse-listen-notify-fanout.md` for the full design. Independent of Spec 08; both gated by Phase B (Spec 07 must seal first — Spec 09's win is measured against a sane DB-perf baseline).

### Phase G: ADR 0007's unimplemented LISTEN/NOTIFY half

- [ ] **G.1: Fire NOTIFY from channel message writes**
  - Surface: after `prisma.channelMessage.create({...})` returns, fire `pg_notify('fast_channel_msg', {channelId, messageId, senderId})` on a separate `pg` connection (or via Prisma `$executeRaw` if overhead is acceptable — measure)
  - Acceptance: write-path test confirms NOTIFY payload landed with expected shape (test uses a second `pg` `LISTEN` connection to assert)
  - Persona: plain technical English commit; `[skip-db-push]` first line (no schema change)
  - Verification: typecheck + lint + test

- [ ] **G.2: Fire NOTIFY from DM writes**
  - File: `apps/fast/app/api/chat/conversations/[id]/messages/route.ts`
  - Surface: NOTIFY channel `fast_dm`; payload `{conversationId, messageId, senderId}`
  - Acceptance: write-path test confirms NOTIFY payload landed
  - Persona: plain technical English commit; `[skip-db-push]`
  - Verification: typecheck + lint + test

- [ ] **G.3: Fire NOTIFY from notification creates**
  - File: `apps/fast/lib/notifications.ts` (central creator) + any direct callsites
  - Surface: NOTIFY channel `fast_notif`; payload `{userId, notificationId}`
  - Acceptance: notification-create test confirms NOTIFY payload landed
  - Persona: plain technical English commit; `[skip-db-push]`
  - Verification: typecheck + lint + test

- [ ] **G.4: Fire NOTIFY from channel read-status updates**
  - File: every `channelReadStatus.upsert` / `.update` callsite
  - Surface: NOTIFY channel `fast_channel_read`; payload `{userId, channelId}`
  - Acceptance: read-status-update test confirms NOTIFY payload landed
  - Persona: plain technical English commit; `[skip-db-push]`
  - Verification: typecheck + lint + test

- [ ] **G.5: Per-instance LISTEN connection + subscriber registry**
  - File: `apps/fast/lib/realtime/subscriber-registry.ts` (new)
  - Dependency: `pg` (or `node-postgres`) — Prisma can't model LISTEN; add as direct dep
  - Shape: `registerSubscriber({id, userId, key, filter, send}) → deregisterFn`; `startListener()` opens one `pg` connection at module boot, LISTENs to all four channels (`fast_channel_msg`, `fast_dm`, `fast_notif`, `fast_channel_read`); routes NOTIFY payloads to matching subscribers
  - Graceful shutdown: SIGTERM handler closes the `pg` connection so Cloud Run instance teardown reclaims the conn-pool slot
  - Acceptance: unit tests cover register/deregister; integration test fires a NOTIFY via a second `pg` connection and asserts the registered subscriber's `send` got called with the right payload
  - Persona: plain technical English commit; `[skip-db-push]`
  - Verification: typecheck + lint + test

- [ ] **G.6: Cut `/api/channels/stream` over to LISTEN-driven**
  - File: `apps/fast/app/api/channels/stream/route.ts`
  - Surface: replace `setInterval(check, 2000)` (line 99) with two `registerSubscriber` calls — one for `fast_channel_msg` filtered on `channelId`, one for `fast_channel_read` filtered on `userId`. On NOTIFY receipt, do single targeted Prisma fetch by id (event-id-then-fetch per ADR 0007 §43), then `send('messages', [row])` / `send('unread', updatedCounts)`
  - **Safety-net poll**: `setInterval(safetyPoll, 60_000)` does what the old 2s poll did, as the belt-and-suspenders against Postgres queue overflow (ADR 0007 §44). Comment block names it as the backstop with 60s rationale
  - On `request.signal.abort`: call deregister fn + clear safety-net interval
  - Acceptance: integration test opens EventSource, writes a channel message via a second test process, asserts `messages` event arrives ≤500ms; safety-net poll wired (mock registry to drop a NOTIFY, assert safety poll catches it)
  - Persona: plain technical English commit; `[skip-db-push]`
  - Verification: typecheck + lint + test

- [ ] **G.7: Cut `/api/chat/stream` over to LISTEN-driven**
  - File: `apps/fast/app/api/chat/stream/route.ts`
  - Surface: mirror G.6 with `fast_dm` filtered on `conversationId`. The raw-SQL `conversation_participants` unread aggregate refreshes on the 60s safety net (cheaper than recomputing on every NOTIFY)
  - Acceptance: integration test parallel to G.6
  - Persona: plain technical English commit; `[skip-db-push]`
  - Verification: typecheck + lint + test

- [ ] **G.8: Cut `/api/notifications/stream` over to LISTEN-driven**
  - File: `apps/fast/app/api/notifications/stream/route.ts`
  - Surface: mirror G.6 with `fast_notif` filtered on `userId`. The 1000ms tick disappears. The 25000ms heartbeat survives (ADR 0007 §49 — keeps proxies/browsers from closing idle connections)
  - Acceptance: integration test parallel to G.6
  - Persona: plain technical English commit; `[skip-db-push]`
  - Verification: typecheck + lint + test

- [ ] **G.9: Cross-instance smoke verification (under current session_affinity=true)**
  - Surface: with affinity still on, manually warm two `coms-fast-web` instances; open SSE on instance A; write a message via instance B; confirm SSE client receives the event
  - Optional file: `apps/fast/docs/sse-fanout-smoke.md` (mirror of `apps/fast/docs/smoke-checklist.md` shape for the SSE-specific verification)
  - Acceptance: operator smoke confirms cross-instance fanout works under current affinity setting
  - Persona: plain technical English commit (operator-window note in commit body)
  - Verification: smoke walk

- [ ] **G.10: Disable Cloud Run session affinity**
  - Files: `infra/fast/cloud-run.tf` — flip `session_affinity = true` → `false` on `coms-fast-web`; `apps/fast/CLAUDE.md` "Cloud Run shape" section — rewrite the session_affinity line + the SSE rationale that justified it
  - Operator step: `tofu apply` in `infra/fast/` (laptop CLI)
  - Acceptance: post-apply, repeat G.9's smoke under `session_affinity=false`; cross-instance fanout still works
  - Persona: Mr. Door for the infra commit (operator's territory); plain technical English for the `apps/fast/CLAUDE.md` edit
  - Verification: smoke walk + `tofu plan` shows zero drift post-apply

- [ ] **G.11: Steady-state DB query observation**
  - Operator step: `pg_stat_statements` snapshots 24h pre-G.10 and 24h post-G.10
  - Acceptance: query count for `ChannelMessage`/`DirectMessage`/`Notification`/`Channel`/`ChannelReadStatus` SELECTs from the SSE routes drops ~95%; snapshot included in PR body
  - Persona: operator-led; commit Mr. Door (doc) or skipped (just monitoring)
  - Verification: ad-hoc query confirms drop

- [ ] **G.12: ADR 0007 amendment**
  - File: `docs/adr/0007-sse-over-websockets.md`
  - Acceptance: dated addendum: "Implementation completed via Spec 09. The LISTEN/NOTIFY fanout fast was missing landed across G.1–G.10. `session_affinity` flipped to `false` post-implementation. Subscriber registry lives at `apps/fast/lib/realtime/subscriber-registry.ts`. Safety-net polling at 60s is the belt-and-suspenders against Postgres queue overflow per the original ADR's §44."
  - Persona: Mr. Door
  - Verification: doc diff + ADR cross-references updated

---

## DEFERRED — out of this plan's scope

- **Spec 03 (Integration Test Kit)** — still stub `docs/spec/03-integration-test-kit.md` ("not yet scoped in detail"). Phase E.1 in `tasks/plan.md`.
- **Spec 04 (SDK as Enforcement Layer)** — still stub `docs/spec/04-sdk-as-enforcement-layer.md`. Phase E.2 in `tasks/plan.md`.
- **Platform notifications v1** — separate future spec; heroes + fast deviation logged in integration contract §10
- **App 3 / App 4 onboarding** — separate future specs once domains scoped
- **HIBP breach-corpus check** — Spec 06 follow-up, listed under Spec 06 §Out of scope
- **Spec 07 audit automation** — out of Spec 07 scope per §172
- **JWT key rotation, refresh tokens** — Spec 08 v2 follow-ups

---

## When everything above is `[x]`

Specs 06 PR F, 07, 08, and 09 are complete. The DB perf audit returns zero findings; `auth_sessions` reads on the validation hot path are zero; the three fast SSE streams use LISTEN/NOTIFY fanout with `session_affinity=false`; portal-web installs cleanly as a PWA; T64's PK promotion has bound fast's User table to portal's UUID space.

Time to:
1. Scope Spec 03 (Integration Test Kit) — convert stub to executable plan
2. Scope Spec 04 (SDK as Enforcement Layer) — convert stub to executable plan
3. Author the platform-notifications-v1 spec (closes integration contract §10's documented deviation)
