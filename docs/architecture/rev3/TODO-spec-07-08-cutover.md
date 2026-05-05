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

### PR 07-1 — Schema + seed ✅ SHIPPED 2026-05-04 (commit `26057ec`)
Repo: `coms_portal`

- [x] `drizzle-kit generate` adding:
  - [x] `org_taxonomies` table per Spec 07 §Schema (`id`, `taxonomy_id`, `key`, `value`, `metadata`, `created_at`, `updated_at`, `updated_by` FK to `identity_users`) — `apps/api/src/db/schema/org-taxonomies.ts`
  - [x] `org_taxonomies_taxonomy_key_uniq` unique index on `(taxonomy_id, key)`
  - [x] `org_taxonomies_taxonomy_id_idx` index on `taxonomy_id`
  - [x] `app_manifests.taxonomies jsonb NOT NULL DEFAULT '[]'` column
  - [x] Migration: `apps/api/src/db/migrations/0031_opposite_beast.sql`
- [x] Seed migration: branches + departments copied from `identity_users` distincts (key == value initially — admin refines display via PR 07-2). **Teams seeded empty** — portal has no enumerable team taxonomy today (the `teams` table is membership groups, a different concept). Admin must populate `(taxonomy_id='teams', ...)` from Heroes' production team table BEFORE Heroes Deploy A; see Cutover window pre-flight.
- [x] Update `apps/api/src/services/manifests/heroes.json` to `schemaVersion: 2` with `"taxonomies": ["branches", "teams", "departments"]`.
- [x] `ManifestDefinition.taxonomies?: string[]` + `registerManifest` writes the array (defaults to `[]`).
- [x] Stage rollback migration `apps/api/src/db/migrations/cutover/0002_restore_heroes_writes.sql` (companion to 0001 — Spec 08 §Rollback). Cutover README extended with rollback section.
- [x] Tests: `manifests.test.ts` 12/12 green (incl. new shape + defaults-to-`[]` cases). `db:generate` clean. `tsc --noEmit` clean.

### PR 07-2 — Read endpoint + admin UI + emit (gated off) ✅ SHIPPED 2026-05-04 (commit `66b0a52`)
Repo: `coms_portal`

- [x] `GET /api/taxonomies/sync` endpoint per Spec 07 §API contract — `apps/api/src/routes/taxonomies.ts`. Auth: existing `requireAppToken`. Filters by calling app's manifest `taxonomies` field.
- [x] Admin UI `/admin/taxonomies` per Spec 07 §Admin UI — `apps/web/src/routes/(authed)/admin/taxonomies/+page.svelte`. Sidebar (taxonomy IDs + entry counts) + right-panel CRUD table + CSV bulk upload + add/edit/delete dialogs. Per-taxonomy lock via new `taxonomy_edit_locks` table (migration `0032_yielding_vance_astro.sql`) instead of overloading `bulk_edit_locks` whose FK targets `app_manifests.appId`.
- [x] Webhook event types added (gated by `ENABLE_TAXONOMY_EVENTS` env flag, off by default): `taxonomy.upserted`, `taxonomy.deleted`, `employment.updated` — `apps/api/src/services/taxonomy-events.ts`. Payload types defined locally; promoted to `@coms-portal/shared` v1.6.0 in PR 07-4. Admin route callers wired here; `employment.updated` caller wired in PR 07-3.
- [x] Tests: 41 across 4 new files — `taxonomies.test.ts` (service 12), `taxonomy-events.test.ts` (events 13), `routes/__tests__/taxonomies.test.ts` (sync endpoint 6), `routes/admin/__tests__/taxonomies.test.ts` (admin CRUD 10). Full API suite 495 pass / 0 fail. `tsc --noEmit` clean (api + web). `db:generate` reports no schema drift.

### PR 07-3 — Wire emit + dual-emit window ✅ SHIPPED 2026-05-04 (commit `8ca124c`)
Repo: `coms_portal`

Dependencies (already in place from PR 07-2): `emitTaxonomyUpserted` / `emitTaxonomyDeleted` / `emitEmploymentUpdated` in `apps/api/src/services/taxonomy-events.ts`, gated by `ENABLE_TAXONOMY_EVENTS` env flag (default `false`). Admin route mutations conditionally call the gated emitters today; `createEmployee` / `updateEmployee` do not.

- [x] PATCH `/v1/employees/:id` fires `emitEmploymentUpdated` when an HR field (branch/department/position/phone/leaderName/birthDate) actually changes value — `apps/api/src/routes/employees.ts`. Pre-update employment block captured before the update; post-update block diffed via new `diffEmployment` helper; suppressed when delta is empty (no-op writes). `team`, `employmentStatus`, `talentaId`, `attendanceName` emitted as `null` placeholders until their identity_users columns land.
- [x] New service module `apps/api/src/services/employment-resolution.ts`: `getEmploymentBlock(userId)` joins identity_users HR fields against `org_taxonomies` for `(taxonomyId, key, value)` refs (falls back to `{key:raw, value:raw}` while seed entries are key==value); `diffEmployment(prev,next)` computes the delta + previous-value pair used by emit; `hasHrFieldChanges` and `HR_FIELD_NAMES` are the source of truth for "what counts as an HR edit."
- [x] `emitUserProvisioned` extended with the Spec 07 envelope: `user{portalSub,name,primaryAliasId:null}`, `contactEmail` (workspace > personal precedence per Spec 06 §Q8a), `employment` (full block), `appConfig` (already present, reaffirmed). Legacy top-level fields (`email`, `appRole`, `branch`) ALSO emitted — dual-emit window per Spec 07 §contract; legacy fields removed in PR 07-5 after Heroes Deploy A.
- [x] Admin bulk taxonomy upsert path already batches into a single `taxonomy.upserted` envelope per `(taxonomyId, batchId)` (PR 07-2). Race-window regression tests added in `routes/admin/__tests__/taxonomies.test.ts` asserting one event per batch (3-entry bulk → 1 dispatch) and one event per single upsert.
- [ ] **OPS step (post-merge):** flip `ENABLE_TAXONOMY_EVENTS=true` in production after staging burn-in. Verify in staging: (a) admin upsert triggers a single delivery to Heroes' webhook endpoint, (b) `createEmployee` triggers `user.provisioned` with the new envelope, (c) `updateEmployee` to a HR field triggers `employment.updated` with delta, (d) no double-emit for non-HR field changes.
- [x] Tests: 29 new across 3 files — `services/__tests__/employment-resolution.test.ts` (10), `__tests__/employees-patch-employment-emit.test.ts` (6), `__tests__/webhook-payload-shape.test.ts` Spec 07 envelope cases (+6). Existing `provisioning-events.test.ts` + `taxonomy-events.test.ts` regressions clean. Full isolated API suite: 519 pass / 0 fail. `tsc --noEmit` clean (api + web). `db:generate` reports no schema drift.

### PR 07-4 — Publish `@coms-portal/shared` v1.6.0 ✅ SHIPPED 2026-05-04 (commit `19cf057`, tag `v1.6.0`)
Repo: `coms-shared` (separate GitHub repo per `project_shared_packages.md`)

- [x] Add types: `EmploymentBlock`, `TaxonomyRef`, `TaxonomyEvent` (upserted + deleted variants), `TaxonomyUpsertedPayload`, `TaxonomyDeletedPayload`, `EmploymentUpdatedPayload`, `AppConfigEvent` (alias of existing `AppConfigUpdatedPayload`), `ContactEmail`, `WebhookUserEnvelope`. Three new event names added to `PORTAL_WEBHOOK_EVENTS`: `taxonomy.upserted`, `taxonomy.deleted`, `employment.updated`.
- [x] Extend `PortalIntegrationManifest` with optional `taxonomies?: string[]`.
- [x] Bump version to v1.6.0; tagged `v1.6.0` and pushed to `origin/main`.
- [x] Verified no breaking changes — locked by `src/__tests__/v1_5_0-backcompat.test.ts` (12 tests exercising every v1.5.0 name and shape verbatim). Full suite: 28/28 pass; `tsc --noEmit` clean.

### PR 07-5 — Drop legacy emit (after Heroes Deploy A confirmed)
Repo: `coms_portal`

- [ ] Bump `@coms-portal/shared` git+url pin from v1.5.0 → v1.6.0 in `apps/api/package.json` (and any other consumers in the workspace). Replace the local payload type declarations in `apps/api/src/services/taxonomy-events.ts` (`TaxonomyUpsertedPayload`, `TaxonomyDeletedPayload`, `EmploymentUpdatedPayload`) and `apps/api/src/services/employment-resolution.ts` (`TaxonomyRef`, `EmploymentBlock`) with imports from `@coms-portal/shared`. Same for the inline envelope type in `provisioning-events.ts` → `WebhookUserEnvelope`.
- [ ] Remove legacy top-level fields (`email`, `appRole`, `branch`) from `user.provisioned` / `user.updated` payloads.
- [ ] Force manifest `schemaVersion: 2` on all registered apps.

---

## Heroes — Spec 08 (after portal v1.6.0 publishes)

### PR A1 — Schema migration (mechanical, ~1 day) ✅ SHIPPED 2026-05-04 (commit `57fd523` on `coms_aha_heroes/main`)
Repo: `coms_aha_heroes`

- [x] Pin `@coms-portal/shared` v1.6.0 in `packages/web/package.json` and `packages/shared/package.json`. Lockfile updated; v1.6.0 tag (`0af3637`) verified reachable on `mrdoorba/coms-shared`.
- [x] `drizzle-kit generate` produced one consolidated migration `packages/shared/src/db/migrations/0011_sparkling_black_bolt.sql` covering ALL of:
  - [x] Rename `users` → `heroes_profiles`. `id` is now `uuid('id').primaryKey()` with no default; portal supplies the `portal_sub` UUID at insert time. Drop+create chosen over drizzle-kit's auto-rename heuristic per spec direction (the column shape changed materially — auto-rename would have been misleading).
  - [x] Drop columns from `heroes_profiles`: `email`, `branch_id`, `team_id`, `role`, `can_submit_points`. (`personal_email` was never present in the heroes-side `users` table; only the portal-side `identity_users` carried it pre-Spec-06.)
  - [x] Add columns to `heroes_profiles`: `branch_key varchar(128)`, `branch_value_snapshot varchar(255)`, `team_key varchar(128)`, `team_value_snapshot varchar(255)`, `department_key varchar(128)`, `department_value_snapshot varchar(255)` plus btree indexes on each `*_key` column.
  - [x] Rewire FKs from `users` → `heroes_profiles` in 10 dependent schemas: `comments`, `point-summaries`, `sheet-sync-jobs`, `challenges`, `redemptions`, `appeals`, `notifications`, `audit-logs`, `achievement-points`, `system-settings`. `user_emails` dropped entirely — replaced by `email_cache`.
  - [x] Add 6 new tables: `pending_alias_resolution`, `alias_cache`, `taxonomy_cache` (composite PK `(taxonomy_id, key)`), `user_config_cache`, `email_cache`, `deactivated_user_ingest_audit`. Schemas match Spec 03 §Schema (heroes side) + Spec 07 §Schema verbatim.
  - [x] Drop `branches` and `teams` local tables (CASCADE drops also remove their dependent FK constraints across the 10 schemas above; the dependent `branch_id` columns remain as nullable plain `uuid` for A2 to drop or denormalize).
  - [x] Drop `authUser` table. `authSession.userId` and `authAccount.userId` retargeted to `heroes_profiles.id` (column type changed `text → uuid`). `authVerification` untouched (no user FK).
- [x] `packages/shared/src/db/schema/index.ts` exports updated; `packages/shared/scripts/generate-schemas.ts` regenerated to drop dropped tables, add 7 new ones, and rename `safeUserSchema` → `safeHeroesProfileSchema`.
- [x] `bun run db:generate` second-run reports "No schema changes, nothing to migrate" — no phantom diffs.
- [x] Manual review + warding of generated SQL: added `IF EXISTS` to every `DROP CONSTRAINT` (the preceding `DROP TABLE … CASCADE` already removed those constraints; without `IF EXISTS` the migration would fail). Inserted a single `TRUNCATE TABLE … RESTART IDENTITY CASCADE` between the `DROP TABLE` block and the `ALTER COLUMN … SET DATA TYPE uuid` / `ADD CONSTRAINT … REFERENCES heroes_profiles` block — required because (a) `text → uuid` on `session.user_id`/`account.user_id` would fail on existing better-auth-shaped string IDs, and (b) the new FKs would fail validation against orphan rows referencing deleted users. Pre-real-users posture makes the in-migration TRUNCATE a no-op in spirit (cutover plan TRUNCATEs anyway).
- [x] **A1 stubs (kept `@coms/shared` typecheck clean so the schema slice can ship independently):**
  - `packages/shared/src/auth/session.ts` — every function except `readSessionCookieFromHeaders` throws `[spec-08-pr-a1] requires the PR A2 broker-exchange rewrite`. PR A2 reimplements directly against `heroes_profiles.id`.
  - `packages/shared/src/db/seed/auth.ts` — no-op (identity moves to portal `user.provisioned` webhook).
  - `packages/shared/src/db/seed/base.ts` — branches insert removed (taxonomies are projected, not seeded).
  - `packages/shared/src/db/seed/dev.ts` — no-op (PR A2 reintroduces dev fixtures against `heroes_profiles` + taxonomy_cache).

**A1 → A2 handoff (known breakage A2 must resolve):**
- ~25 files across `packages/server` + `packages/web` still import dropped symbols (`users`, `userEmails`, `branches`, `teams`, `authUser`). Server typecheck reports 29 errors. All in A2's rewrite surface (webhook handler split, broker exchange, sheet-sync rewrite, repositories, services).
- `fn_sync_point_summary` trigger function (defined in migration `0002_triggers.sql`) still references the dropped `users` table. The `BEFORE UPDATE` trigger fires on `achievement_points` / `challenges` / `appeals` / `comments` / `rewards` / `redemptions` / `system_settings` updates — but A1's migration TRUNCATEs `achievement_points`, so no rows will trigger it until A2 re-introduces ingestion. A2 must either DROP and recreate this function against `heroes_profiles`, or drop it entirely if the point-summary materialisation moves to application code.
- `idx_*_branch` indexes on the 10 dependent tables now reference an unconstrained `branch_id` column. Indexes still work; A2 decides whether to drop them or rebuild on a different column (e.g., a denormalised `branch_key`).

### PR A2 — Behaviour ✅ SHIPPED + DEPLOYED to staging 2026-05-04 (8 slices + 2 deploy fixes across 13 commits)
Repo: `coms_aha_heroes`

A2 delivered in 8 slices across 11 commits (`b289dbd`, `44f856c`, `5392d98`, `257d021`, `c0d026d`, `feccc27`, `7c2cf7f`, `75621df`, `0e20355`, `da0cc09`, `d9e0c31`, `6989f1d`, `8b4e2ad`). Two deploy-time follow-up fixes landed on push: `a7f9ed9` (svelte-check fallout — 4 .svelte template field renames missed by the Slice 8 sweep that grepped only `+page.server.ts` files) and `f62f2be` (migration 0011 needed `USING "user_id"::uuid` on the text→uuid type changes — PostgreSQL refuses to implicitly cast even on TRUNCATEd tables; surfaced via local Docker postgres reproduction after CI's drizzle-kit spinner ate the postgres ERROR). All slices followed TDD with bun:test and committed via /mr-door-commit.

**Final verification gate (commit `f62f2be`, deployed to heroes staging via run `25314176044`):**
- `bun run --filter=@coms/server typecheck` → 0 errors (down from 27 baseline)
- `bun run --filter=@coms/web typecheck` → 0 errors / 5915 files (was 4 errors after first push)
- `bun test packages/server scripts` → 67 pass / 0 fail (up from 49 — Slice 6 added 18 tests)
- `bun run ci:check-no-illegal-inserts` → 0 violations across 174 files (down from 3)
- Heroes CI ✅ run `25314122508`; Heroes Deploy ✅ run `25314176044`. **Heroes Deploy A is LIVE IN STAGING.** Cutover window + portal PR 07-5 are the remaining work.

**Webhook handler split (Slice 1+2+3 SHIPPED commit `b289dbd`):**
- [x] `packages/server/src/routes/portal-webhooks.ts` refactored 187 → 61 lines: HTTP + OIDC + idempotency dedupe + body parse + `dispatchPortalEvent`.
- [x] `packages/server/src/services/portal-events/dispatch.ts` — pure router with injectable handler map (3 unit tests).
- [x] `packages/server/src/services/portal-events/payload-projection.ts` — pure projection helpers exhaustively tested (8 unit tests covering null employment, sparse employment-updated, taxonomy ref expansion).
- [x] All 11 handlers implemented:
  - [x] `handle-user-provisioned.ts` — materializes `heroes_profiles` + `email_cache` + `user_config_cache` from the Spec 07 envelope.
  - [x] `handle-user-updated.ts` — identity-only (name) + email_cache refresh.
  - [x] `handle-employment-updated.ts` — denormalizes `(key, value_snapshot)` onto `heroes_profiles` from sparse payload.
  - [x] `handle-user-offboarded.ts` — flips `is_active` + revokes sessions.
  - [x] `handle-app-config-updated.ts` — upserts `user_config_cache`.
  - [x] `handle-alias-resolved.ts` — upserts `alias_cache` + calls `drainPendingAliasQueue` (replay backend deferred to Slice 6; current behaviour marks rows resolved).
  - [x] `handle-alias-updated.ts` — invalidates `alias_cache` + drains pending.
  - [x] `handle-alias-deleted.ts` — invalidates `alias_cache` only.
  - [x] `handle-taxonomy-upserted.ts` — bulk-upserts `taxonomy_cache` (single statement per event per Spec 07 §Race window).
  - [x] `handle-taxonomy-deleted.ts` — bulk-deletes from `taxonomy_cache`.
  - [x] `handle-session-revoked.ts` — calls `destroySessionsForPortalSub` (restored in Slice 5).
- [x] `packages/server/package.json` gains `@coms-portal/shared` v1.6.0 as direct dep so envelope types resolve at the workspace boundary.

**Pull-on-boot + portal API client (Slice 4 SHIPPED commit `44f856c`):**
- [x] `packages/server/src/lib/portal-api-client.ts` — `fetchTaxonomySync` and `resolveAliasesBatch` wrappers using `GoogleAuth.getIdTokenClient(audience)` with per-audience client cache.
- [x] `packages/server/src/services/portal-bootstrap.ts` — `pullTaxonomiesOnBoot()` fires inside `app.listen` callback, reuses `handleTaxonomyUpserted` per taxonomy, outage-tolerant (warns + continues if portal unreachable). 3 unit tests via injectable fetcher/handler stubs.

**Broker exchange + session module restoration (Slice 5 SHIPPED commit `44f856c`):**
- [x] `packages/shared/src/auth/session.ts` — all 4 functions reimplemented against post-A1 schema (`createLocalSessionForPortalUser`, `getLocalSessionByToken`, `destroyLocalSessionByToken`, `destroySessionsForPortalSub`). `LocalSessionRecord` keeps `email` field via `email_cache` left-join at lookup time.
- [x] Broker exchange handler at `packages/web/src/routes/auth/portal/exchange/+server.ts` is unchanged at the file level — `createLocalSessionForPortalUser` now does the `heroes_profiles` + `email_cache` upsert per Spec 08 §Decision #10. Last-write-wins with webhook handler.
- [x] better-auth retargeting deferred — handled by direct schema FK in A1 (`authSession.userId` → `heroes_profiles.id`); better-auth library reconfiguration is not strictly required for the bespoke session functions to operate. Revisit when better-auth is exercised on a code path that requires its internal user reference.

**Cutover tools + CI guard (Slice 7 SHIPPED commit `5392d98`):**
- [x] `bun run cutover:verify` (`scripts/cutover-verify.ts`) — implements 5 checks per Spec 08 §Cutover sequence. Checks 2 + 3 fully automated (taxonomy_cache vs portal sync; pending-alias `--since-iso=` filter); checks 1 + 4 + 5 surfaced as PASS / FAIL / MANUAL with detail.
- [x] `POST /api/admin/pending-aliases/sweep` (`packages/server/src/routes/admin-pending-aliases.ts`) — drains pending queue via `resolveAliasesBatch` (1000-name batches), routes outcomes to `deactivated_user_ingest_audit` / status='resolved' / retry++. Auth: OIDC SA bearer (operationally callable today; Slice 8 may convert to user-role gate once middleware is restored).
- [x] `bun run ci:check-no-illegal-inserts` (`scripts/check-no-illegal-inserts.ts`) — 10 unit tests; flags `INSERT INTO users` anywhere and `INSERT INTO heroes_profiles` outside the two-entry whitelist (handle-user-provisioned + session.ts). First run found 3 real violations in `repositories/users.ts` + `services/sheet-sync.ts` — Slice 6/8 will excise them.

**Sheet-sync rewrite (Slice 6 ✅ SHIPPED 2026-05-04 across 5 commits):**

Repo: `coms_aha_heroes`. Commits: `0e20355` (6A+6B test grid + reroute), `da0cc09` (6C replay), `d9e0c31` (6D sweep refactor), `6989f1d` (6E trigger drop), `8b4e2ad` (6F CI guard whitelist).

- [x] `packages/server/src/services/sheet-sync.ts` rewritten — ingestion now batches normalized names through `resolveAliasesBatch` (1000-row chunks, parallelized for >1000) and routes 4 outcomes: active→domain row keyed on heroes_profiles.id; tombstoned→`deactivated_user_ingest_audit` with raw_payload; unresolved→`pending_alias_resolution` with raw_payload; batch-failure→retry with surfaced error.
- [x] `findOrCreateUsersBatch` + `getOrCreateInactiveTeam` + `preloadUserCache` + `placeholder.local` email pattern all excised. CI guard `bun run ci:check-no-illegal-inserts` reports 0 violations across 174 files.
- [x] `drainPendingAliasQueue` in `packages/server/src/services/sheet-sync-pending.ts` replaced with real replay — reads pending rows, looks up alias_cache for portal_sub, re-runs domain insert against cached rawPayload, marks status='resolved'/'failed' with retry_count++.
- [x] `POST /api/admin/pending-aliases/sweep` (`routes/admin-pending-aliases.ts`) refactored to call `drainPendingAliasQueue` — sweep now writes domain rows.
- [x] sheet-sync test suite covers all 4 outcomes per ingestion path (syncEmployees / syncPoints / syncRedemptions). 18 new tests; total `bun test packages/server scripts` now 67 pass / 0 fail.
- [x] `fn_sync_point_summary` trigger DROPPED via new migration (`6989f1d`). Decision: point-summary materialization moves to application code (`recalculatePointSummaries` already handled it). Trigger removal eliminates the `users` table reference and the in-database business logic.

**Repos/services typecheck cleanup (Slice 8 ✅ SHIPPED 2026-05-04 across 5 commits):**

Repo: `coms_aha_heroes`. Commits: `257d021` (A delete dead auth-sync), `c0d026d` (B repo layer), `feccc27` (C service layer), `7c2cf7f` (C-cleanup reports + scheduler), `75621df` (D middleware/auth.ts + hooks.server.ts AuthUser lynchpin reshape). Sub-slice E (frontend cascade) was implicitly satisfied — preserving `branchKey`-as-string semantics in AuthUser meant only `locals.user.role` reads survived in authed routes, and `role` is preserved unchanged. Final typecheck: 27→0 errors.

All errors trace to A1's dropped imports of `users`, `branches`, `teams`, `userEmails` from `@coms/shared/db/schema`. The data model collapsed: `users JOIN branches` → `heroes_profiles.branchKey/branchValueSnapshot` denormalized; `users.role` / `users.canSubmitPoints` → `user_config_cache.config.{role,canSubmitPoints}`; `users.email` → `email_cache.contactEmail`; `teams` table → `heroes_profiles.teamKey/teamValueSnapshot` denormalized (no enumerable team table on heroes side anymore).

Suggested execution order (lowest blast-radius first):

1. **Dead code (zero blast)**: `services/auth-sync.ts` has zero callers (verified via grep) — delete the file outright. Also remove its imports from any barrel files.
2. **Repository slice** (8 files, ~700 lines total): `repositories/{appeals, audit-logs, challenges, comments, points, redemptions, teams, users}.ts`. Each is small and self-contained; pattern is:
   - Swap `users` import → `heroesProfiles`
   - Drop `users.email` / `users.role` / `users.canSubmitPoints` selections — those move to JOINs against `email_cache` / `user_config_cache` if the caller needs them
   - `users.branchId` / `users.teamId` → `heroesProfiles.branchKey` / `heroesProfiles.teamKey` (string keys, not uuid FKs)
   - `repositories/teams.ts`: the `teams` concept is gone — file becomes a thin reader over `taxonomyCache WHERE taxonomy_id='teams'` OR is removed entirely (consumer is `routes/teams.ts` + frontend `/teams/+page.server.ts`; need to decide if a teams page still makes sense post-cutover)
   - `repositories/users.ts`: rename to `repositories/heroes-profiles.ts` and reshape — `createUser` becomes the broker/webhook job (NOT a repository call; CI guard enforces this)
3. **Service slice** (9 files, ~1500 lines total): `services/{appeals, approval, challenges, dashboard, leaderboard, points, reports, sheet-sync-scheduler}.ts`. Same swap pattern as repositories.
4. **Lynchpin — `middleware/auth.ts`**: reshape `AuthUser` from `users + userEmails` JOIN → `heroes_profiles + email_cache + user_config_cache`. Today's shape: `{id, email, name, role, branchId, teamId, canSubmitPoints, mustChangePassword}`. Post-cutover suggestion: `{id, email, name, role, branchKey, branchValueSnapshot, teamKey, teamValueSnapshot, canSubmitPoints, mustChangePassword}` — preserves `branchId`-as-string semantics by reusing `branchKey`. Both consumers (`packages/server/src/middleware/auth.ts` server-side and `packages/web/src/hooks.server.ts` SvelteKit-side) do the same JOIN pattern; refactor both together.
5. **Frontend cascade** in `packages/web/src/routes/(authed)/**`: every `+page.server.ts` that reads `locals.user.role`, `locals.user.email`, `locals.user.branchId`, `locals.user.teamId` will need updating. If you preserve `branchId`-as-string in step 4 by aliasing to `branchKey`, the cascade is smaller.
6. **Re-run** `bun run --filter=server typecheck` and `bun test` after each file. The CI guard should also stay green throughout.

Cross-cutting: `routes/sheet-sync.ts` overlaps with Slice 6 — coordinate so they don't collide.

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

## PR A2 SHIPPED + DEPLOYED to staging (2026-05-04) — what to do next

Heroes `origin/main` carries the full PR A2 deliverable through commit `f62f2be` (pushed 2026-05-04). Heroes Deploy A is LIVE in staging via Deploy run `25314176044`.

**Final A2 verification gate:**
- `bun run --filter=@coms/server typecheck` → 0 errors (down from 27 baseline)
- `bun run --filter=@coms/web typecheck` → 0 errors / 5915 files
- `bun test packages/server scripts` → 67 pass / 0 fail (up from 49; Slice 6 added 18 four-outcome tests)
- `bun run ci:check-no-illegal-inserts` → 0 violations across 174 source files (down from 3)
- Heroes CI ✅ + Deploy ✅ on sha `f62f2be`

**Remaining work (operational, not blocked on code):**

1. **Smoke-test heroes staging** — log in, run a sheet ingestion, exercise admin flows, hit `/profile`. Confirm webhook fan-out works end-to-end with portal staging.
2. **Pre-cutover (T-1h)** — see §"Cutover window" block above. Critical pre-flight: portal admin populates `(taxonomy_id='teams', ...)` from Heroes' production team table BEFORE the cutover window. Without this, taxonomy_cache will be sparse for teams in production.
3. **Ops flips `ENABLE_TAXONOMY_EVENTS=true`** in portal production after staging burn-in (PR 07-3 §OPS step).
4. **Run `bun run cutover:verify`** against staging end-to-end before scheduling the production cutover. All 5 checks must pass.
5. **Cutover window execution** (<30min, both teams) per §"Cutover window" runbook above.
6. **Apply cutover migration `0001_revoke_heroes_writes.sql`** on portal at T+30min (Deploy C).
7. **After Heroes Deploy A confirms stable in production** — execute portal PR 07-5 (drop legacy emit fields, bump `@coms-portal/shared` git+url pin to v1.6.0, force manifest schemaVersion:2). Detailed scope in §"PR 07-5" block above.
8. **Cleanup phases** (Heroes + portal) per §"Cleanup" blocks above, ~7 days after cutover stable.

---

## When stuck

- Stuck on a Drizzle migration shape: read `feedback_drizzle_migrations.md` in user memory.
- Stuck on a webhook event payload shape: Spec 07 §API contract is authoritative. Local payload types live at `apps/api/src/services/taxonomy-events.ts` until PR 07-4 promotes them to `@coms-portal/shared` v1.6.0.
- Stuck on the employment block — what does it carry, what counts as an HR edit: read `apps/api/src/services/employment-resolution.ts`. `HR_FIELD_NAMES` is the source of truth for which identity_users columns trigger `employment.updated`. `getEmploymentBlock(userId)` resolves taxonomy refs; `diffEmployment(prev,next)` is reused by any caller that needs a delta.
- Webhook events not firing in dev: check `ENABLE_TAXONOMY_EVENTS` env var. Default off (PR 07-2 emit machinery is gated). Set `ENABLE_TAXONOMY_EVENTS=true` in `.env.local` to test end-to-end.
- Stuck on a Heroes-side decision not in the spec: Heroes `CONTEXT.md` glossary first, then ADR 0001.
- Webhook ordering race (taxonomy event arrives after employment event): handler re-throws → DLQ retry → idempotency on `eventId` covers it. Don't add a sleep loop.
- A locked decision feels wrong: raise before changing. Re-grill with `/grill-with-docs` if it really is wrong.
