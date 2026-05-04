# TODO — Spec 07 + Spec 08 Heroes Cutover

Sequenced implementation checklist. Work top-to-bottom. Each block ends in a deployable PR.

**Source-of-truth specs (read these before starting any block):**
- Portal contract: `docs/architecture/rev3/spec-07-org-taxonomies-and-employment-block.md`
- Heroes migration: `docs/architecture/rev3/spec-08-heroes-spec-03-cutover-protocol.md`
- Heroes glossary + decisions: `coms_aha_heroes/CONTEXT.md`
- Why taxonomies are portal-owned: `coms_aha_heroes/docs/adr/0001-portal-owned-org-taxonomies.md`

**Standing rules (do not violate):**
- Schema changes: `drizzle-kit generate` only. Never hand-edit `meta/_journal.json`.
- New webhook events: additive on portal side until Heroes Deploy A confirms; no consumer-side runtime feature flags.
- Heroes pins `@coms-portal/shared` v1.6.0 as the contract handshake; do not bump twice.
- Don't re-design any locked decision. They live in Spec 08 §Decisions Up Front. If a decision feels wrong during impl, raise it before changing — the trade-off was deliberately resolved.

---

## Portal — Spec 07 (ships first)

### PR 07-1 — Schema + seed
Repo: `coms_portal`

- [ ] `drizzle-kit generate` adding:
  - [ ] `org_taxonomies` table per Spec 07 §Schema (`id`, `taxonomy_id`, `key`, `value`, `metadata`, `created_at`, `updated_at`, `updated_by` FK to `identity_users`)
  - [ ] `org_taxonomies_taxonomy_key_uniq` unique index on `(taxonomy_id, key)`
  - [ ] `org_taxonomies_taxonomy_id_idx` index on `taxonomy_id`
  - [ ] `app_manifests.taxonomies jsonb NOT NULL DEFAULT '[]'` column
- [ ] Seed migration: copy current branch + team values from Heroes' production state into `org_taxonomies` as `(taxonomy_id='branches', ...)` and `(taxonomy_id='teams', ...)`. Departments seeded if portal has them; otherwise empty.
- [ ] Update `apps/api/src/services/manifests/heroes.json` to `schemaVersion: 2` with `"taxonomies": ["branches", "teams", "departments"]`.
- [ ] Stage rollback migration `apps/api/src/db/migrations/cutover/0002_restore_heroes_writes.sql` (companion to 0001 — Spec 08 §Rollback).

### PR 07-2 — Read endpoint + admin UI + emit (gated off)
Repo: `coms_portal`

- [ ] `GET /api/taxonomies/sync` endpoint per Spec 07 §API contract. Auth: existing `requireAppToken`. Filters by calling app's manifest `taxonomies` field.
- [ ] Admin UI `/admin/taxonomies` per Spec 07 §Admin UI. Reuse `BatchToolbar` + manifest-rendered editor primitives from `/admin/app-config`. Per-taxonomy `bulk_edit_locks`.
- [ ] Webhook event types added (gated by env flag, off by default): `taxonomy.upserted`, `taxonomy.deleted`, `employment.updated`. Implementation only — no firing yet.
- [ ] Tests: taxonomy CRUD, sync endpoint filtering by manifest, bulk edit lock, webhook payload shape.

### PR 07-3 — Wire emit + dual-emit window
Repo: `coms_portal`

- [ ] `createEmployee` / `updateEmployee` fire `employment.updated` on HR-field changes (branch/team/department/position/phone/employmentStatus/talentaId/attendanceName/leaderName/birthDate).
- [ ] `user.provisioned` payload extended with `employment`, `contactEmail`, `appConfig` blocks per Spec 07 §API contract.
- [ ] **Dual-emit:** legacy top-level fields (`email`, `appRole`, `branch`) ALSO emitted alongside the new envelope so today's Heroes handler keeps working.
- [ ] Admin UI on taxonomy creation flow: emit `taxonomy.upserted` BEFORE any `employment.updated` that references new keys (Spec 07 §Race window).
- [ ] Flip the env flag from PR 07-2 ON in production after staging burn-in.

### PR 07-4 — Publish `@coms-portal/shared` v1.6.0
Repo: `coms-shared` (separate GitHub repo per `project_shared_packages.md`)

- [ ] Add types: `EmploymentBlock`, `TaxonomyEvent` (upserted + deleted variants), `AppConfigEvent`, `ContactEmail`, `WebhookUserEnvelope`.
- [ ] Extend `AppManifest` with `taxonomies: string[]`.
- [ ] Bump version to v1.6.0; tag and push.
- [ ] Verify no breaking changes for existing consumers (Heroes still on v1.5.0 must compile).

### PR 07-5 — Drop legacy emit (after Heroes Deploy A confirmed)
Repo: `coms_portal`

- [ ] Remove legacy top-level fields (`email`, `appRole`, `branch`) from `user.provisioned` / `user.updated` payloads.
- [ ] Force manifest `schemaVersion: 2` on all registered apps.

---

## Heroes — Spec 08 (after portal v1.6.0 publishes)

### PR A1 — Schema migration (mechanical, ~1 day)
Repo: `coms_aha_heroes`

- [ ] Pin `@coms-portal/shared` v1.6.0 in `packages/web/package.json` and `packages/shared/package.json`.
- [ ] `drizzle-kit generate` covering ALL of the following in one migration:
  - [ ] Rename `users` → `heroes_profiles`. Change `id` from `uuid().defaultRandom()` → `uuid()` (no default; portal supplies).
  - [ ] Drop columns from `heroes_profiles`: `email`, `personal_email`, `branchId`, `teamId`, `role`, `canSubmitPoints`.
  - [ ] Add columns to `heroes_profiles`: `branch_key varchar(128)`, `branch_value_snapshot varchar(255)`, `team_key varchar(128)`, `team_value_snapshot varchar(255)`, `department_key varchar(128)`, `department_value_snapshot varchar(255)`.
  - [ ] Rewire FKs from `users` → `heroes_profiles` in 11 schemas: `comments`, `point-summaries`, `sheet-sync-jobs`, `challenges`, `redemptions`, `appeals`, `notifications`, `audit-logs`, `achievement-points`, `system-settings`, `user_emails` (drop `user_emails` entirely — replaced by `email_cache`).
  - [ ] Add 6 new tables: `pending_alias_resolution`, `alias_cache`, `taxonomy_cache`, `user_config_cache`, `email_cache`, `deactivated_user_ingest_audit`. Schemas per Spec 03 §Schema (heroes side) and Spec 07 §Schema.
  - [ ] Drop `branches` and `teams` local tables.
  - [ ] Drop `authUser` table; `authSession.userId` FK retargeted to `heroes_profiles.id`.
- [ ] Update `packages/shared/src/db/schema/index.ts` exports.
- [ ] Verify `bun run db:generate` produces no phantom diffs after the migration.
- [ ] Manual review of generated SQL before commit (Drizzle does not always pick the right rename heuristic; prefer drop+create over surprise data preservation).

### PR A2 — Behaviour (~1 week)
Repo: `coms_aha_heroes`

**Webhook handler split:**
- [ ] Refactor `packages/server/src/routes/portal-webhooks.ts` to ~80 lines: HTTP layer + OIDC verify + idempotency dedupe + body parse + dispatch only.
- [ ] Create `packages/server/src/services/portal-events/` with one handler per file:
  - [ ] `handle-user-provisioned.ts` — materialize `heroes_profiles` from `user` + `employment` + `appConfig`; upsert `email_cache`, `user_config_cache`. ~60 lines.
  - [ ] `handle-user-updated.ts` — identity-field updates (email/name only). ~30 lines.
  - [ ] `handle-employment-updated.ts` — denormalize `(key, value_snapshot)` onto `heroes_profiles`. Re-throw on missing taxonomy key (DLQ retry). ~50 lines.
  - [ ] `handle-user-offboarded.ts` — flip `is_active`; soft-delete only. ~25 lines.
  - [ ] `handle-app-config-updated.ts` — update `user_config_cache`; toggle leaderboard suppression based on `leaderboard_eligible`. ~40 lines.
  - [ ] `handle-alias-resolved.ts` — drain `pending_alias_resolution` by `raw_name_normalized`. ~70 lines.
  - [ ] `handle-alias-updated.ts` — invalidate `alias_cache` AND walk pending queue (identity-merge case). ~30 lines.
  - [ ] `handle-alias-deleted.ts` — invalidate `alias_cache` only. ~25 lines.
  - [ ] `handle-taxonomy-upserted.ts` — upsert `taxonomy_cache`. ~40 lines.
  - [ ] `handle-taxonomy-deleted.ts` — remove from `taxonomy_cache`. ~25 lines.
- [ ] Each handler has a focused unit test file beside it.

**Pull-on-boot:**
- [ ] Heroes server startup hook calls `GET /api/taxonomies/sync` and populates `taxonomy_cache`. Same shape any future H-app uses to onboard.
- [ ] Idempotent on restart; safe to re-call.

**Broker exchange upsert:**
- [ ] Rewrite `packages/web/src/routes/auth/portal/exchange/+server.ts` to upsert `heroes_profiles` with `(portal_sub, contactEmail, name)` from handoff payload.
- [ ] No FK to `authUser` anymore — `authSession.userId` points directly at `heroes_profiles.id`.
- [ ] better-auth config retargeted to use `heroes_profiles` as the `user` table reference.
- [ ] Last-write-wins on overlapping fields with webhook handler.

**Ingestion rewrite:**
- [ ] Rewrite `packages/server/src/services/sheet-sync.ts` (945 lines) ingestion path:
  - [ ] Per sheet upload: collect normalized names, batch-call `POST /api/aliases/resolve-batch` (max 1000 names per call, parallelize for >1000).
  - [ ] Resolved + not tombstoned → write points to `heroes_profiles`-keyed domain rows.
  - [ ] Resolved + tombstoned → `deactivated_user_ingest_audit`. Do NOT ingest.
  - [ ] Unresolved → `pending_alias_resolution`. Do NOT auto-create user.
- [ ] Delete every legacy `INSERT INTO users` code path identified by Phase 0 audit (`grep -rn "INSERT INTO users\|.insert(users)" packages/server/src`).
- [ ] `services/sheet-sync.ts` test suite covers all four outcomes per row.

**Cutover tools:**
- [ ] `bun run cutover:verify` script implementing all 5 checks per Spec 08 §Cutover sequence.
- [ ] `POST /admin/pending-aliases/sweep` endpoint — re-resolve all `pending` rows on demand. Auth: super_admin only.

**CI guard:**
- [ ] Static check fails build if `INSERT INTO users` (case-insensitive) appears anywhere.
- [ ] Static check fails build if `INSERT INTO heroes_profiles` appears outside `services/portal-events/handle-user-provisioned.ts` and the broker exchange handler.

---

## Cutover window (<30min, both teams)

Runbook execution. Pre-cutover (T-1h):

- [ ] Portal: `org_taxonomies` populated, verified manually (admin UI count check).
- [ ] Portal: Heroes manifest at v2 with `taxonomies: ["branches", "teams", "departments"]`.
- [ ] Portal: Heroes service-account WIF binding for `GET /api/taxonomies/sync` verified.
- [ ] Heroes: PR A1 + PR A2 deployed to staging; cutover-verify script proven against staging.
- [ ] Both teams in a shared comms channel; declare cutover window start.

T-0:

- [ ] Heroes: TRUNCATE all domain tables AND all caches per Spec 08 §Cutover sequence step 1.
- [ ] Heroes: restart service. Boot triggers `GET /api/taxonomies/sync`; `taxonomy_cache` populates.
- [ ] Heroes: confirm `taxonomy_cache` count == portal `org_taxonomies` count per `taxonomy_id`.
- [ ] Portal admin: run CSV/Sheet/manual provisioning for full user roster. Each `user.provisioned` event flows.
- [ ] Heroes: confirm `heroes_profiles` count grows to match.
- [ ] Portal admin: set per-app config where defaults are wrong (single + bulk via `/admin/app-config`).
- [ ] Heroes ops: re-run sheet ingestion for points data. Watch `pending_alias_resolution` for drops.

T+~25min — verify gate:

- [ ] Run `bun run cutover:verify` on Heroes. All 5 checks must pass.

T+30min — Deploy C:

- [ ] Portal: apply `apps/api/src/db/migrations/cutover/0001_revoke_heroes_writes.sql`.
- [ ] Verification: Heroes SA forced `INSERT INTO identity_users` from staging — must fail.

---

## Cleanup (Heroes Phase 6, after cutover stable for ~7d)

Repo: `coms_aha_heroes`

- [ ] Delete the legacy webhook field-reader fallback if any survived A2 (none should — `body.email`/`body.appRole`/`body.branch` direct reads in the old handler).
- [ ] Update `CLAUDE.md` to reflect: identity comes from portal, per-app config comes from portal, sheet ingestion never creates users, taxonomies projected from portal.
- [ ] Remove this TODO doc and `TODO-spec-07-08-cutover.md` mirror from heroes repo (cutover archived to spec-00 timeline).

## Cleanup portal-side

- [ ] Spec 07 PR 07-5 (drop legacy emit fields).
- [ ] Update `docs/architecture/rev3/spec-00-implementation-timeline.md` to mark Spec 07 + 08 SHIPPED with commit refs.
- [ ] Delete this TODO doc from portal repo (cutover archived).

---

## When stuck

- Stuck on a Drizzle migration shape: read `feedback_drizzle_migrations.md` in user memory.
- Stuck on a webhook event payload shape: Spec 07 §API contract is authoritative.
- Stuck on a Heroes-side decision not in the spec: Heroes `CONTEXT.md` glossary first, then ADR 0001.
- Webhook ordering race (taxonomy event arrives after employment event): handler re-throws → DLQ retry → idempotency on `eventId` covers it. Don't add a sleep loop.
- A locked decision feels wrong: raise before changing. Re-grill with `/grill-with-docs` if it really is wrong.
