# Rev 4 — Spec 07: Fast Onboarding & Identity Migration

> **Status: APPROVED 2026-05-08; Phases 0 + 1 SHIPPED 2026-05-08.** Owner: Mr. Door. Trigger: Spec 06 named Fast (Next.js, brownfield) as the second first-party H-app onboarding. Spec 06 closed the docs + tooling gap for any future onboarding; Spec 07 is the actual Fast integration — the first time a brownfield app with real production data, its own Postgres, its own Cloud Run, and its own auth system (better-auth + Google OAuth) joins the portal as an H-app.
>
> **Distinguishing characteristic vs. Heroes (Rev 3 Spec 03):** Heroes was pre-real-users, so its cutover could `TRUNCATE` every domain table and rematerialize from portal webhooks. Fast cannot. Tasks, channels, channel messages, thread replies, direct messages, notes, milestones, activity logs, routine claims, comments, savedTasks, savedMessages, meetings — ~25 tables FK to `User.id` with `onDelete: Cascade`. The whole spec is structured around preserving every FK chain through an identity rekey.
>
> **Prerequisites:** Spec 01 SDK v1.0 SHIPPED. Spec 02 SDK Heroes Adoption SHIPPED. Spec 06 (Onboarding scaffolding) PR A + B + cross-repo SHIPPED — Fast adoption uses the smoketest verb and the revised quickstart's brownfield path. Spec 03 (HS256 rip-out) does **not** gate Spec 07; Fast adopts the post-rip surface from day one regardless of whether Spec 03 has shipped (Fast does not have a legacy transport mode to migrate from).

---

## Status — 2026-05-08

APPROVED. Phase 0 shipped 2026-05-08 (operational; no code). Artifacts: `docs/architecture/rev4/spec-07-artifacts/`. Phase 1 unblocked once the staging restore dry-run completes.

User-approved decisions captured 2026-05-08 before drafting:

1. **Orphan handling** — Auto-provision in portal *for non-test orphans only*. Every aha-fast `User` whose email has no matching portal `identity_users` row gets one created during Phase 1, **except** for orphans that Phase 0 triage classifies as test/role mailboxes; those are deleted from Fast pre-rekey instead. (Refines D1 — see Phase 0 outcomes.)
2. **Infra footprint** — Fast keeps its own Cloud SQL + Cloud Run, mirroring the Heroes pattern. Portal owns identity/auth only.
3. **Delivery cadence** — Sequenced PRs by phase, each independently revertible. Not one big bundled PR.
4. **Spec-first** — This doc lands and is reviewed before any code touches either repo.

### Phase 0 outcomes (2026-05-08)

- 16 active Fast users → **12 active** post-cleanup (4 test/role accounts deleted: `tmp@`, `tmp2@`, `tbranding@`, `tpr@`).
- 11 of 12 remaining users have a known portal `identity_users.id` for Phase 2C backfill; `admin@gmail.com` is the only orphan to auto-provision in Phase 1C.
- Total Fast DB size: **13 MB**. Largest table `notifications` (~2.6k rows). Pre-rekey rollback dump is 375 KB at `gs://aha-fast-spec07-baseline/pre-cleanup/`.
- Migration baseline: 36 FK columns × 30 dependent tables, ~3,950 rows on 12 users (artifact `1-migration-baseline.csv`).
- **Q3 resolved:** Fast runs on a single DB role (`aha-fast-admin`) for both runtime and migrations. Phase 5B PR scope expanded to include a role split before it can revoke write grants on better-auth tables.
- Implication: Phase 4B's "~10 min" maintenance window is generous by ~100×; real lock + UPDATE will be sub-second at this volume. Schedule a few-minute window for safety + verification reads, not ten.

---

## Problem

Fast is a Next.js + Prisma + Postgres app deployed on Cloud Run with its own auth stack (better-auth email/password + Google OAuth, Prisma adapter on its own DB). It carries significant production data: ~25 tables with FK chains rooted at `User.id`, including tasks, channels, channel messages, thread replies, direct messages, notes, milestones, activity logs, routine task claims, task comments, saved tasks, saved messages, meetings, meeting guests, conversation participants, channel members, channel read statuses, message reactions, dm reactions, task collaborators, task delegations, routine task delegations, user activity dailies, user archived tasks, and Google tokens. Most relations use `onDelete: Cascade`.

The portal is the Rev 3 system of record for identity (`identity_users`), email (Spec 06), employment, taxonomies, and per-app config. Heroes consumes that surface: it has no local user-create code path, no local auth flow except the portal handoff, and rekeyed its `users` table to `heroes_profiles` with `id = portal_sub`. Heroes was able to do this in a single coordinated cutover by `TRUNCATE`ing all domain tables and rematerializing from `user.provisioned` webhooks because Heroes was pre-real-users.

Fast cannot truncate. The integration must:

1. Preserve every existing aha-fast row and every FK reference on it.
2. Replace better-auth as the source of authentication, while keeping better-auth's session/account tables alive long enough for a rollback window.
3. Move per-app role + team assignment into portal's App Configuration admin, with portal as authoritative.
4. Adopt the same H-app contract Heroes adopted: portal handoff at `/auth/portal/exchange`, webhook receiver at `/api/webhooks/portal`, taxonomy cache, email cache, idempotency dedupe.
5. Do all of the above without a single user losing a task, a message, a note, or a channel membership.

The friction Spec 06 closed (docs + smoketest) gets used for the first time here. The friction this spec uncovers — anything specific to brownfield identity rekey under live data — is captured as either a follow-up to Spec 06 (if generalizable) or as Fast-specific scar tissue (if not).

---

## Scope

**In scope:**

- Register Fast in the App Registry: `apps` row, `app_manifests` row via `coms-portal-cli register-manifest`, webhook endpoint(s) via portal admin UI.
- Define Fast's per-app config schema: `role` (employee | leader | admin), `teamId` (FK to a portal-projected team taxonomy entry), and any other app-scoped attribute the existing `User` model carries that is not identity- or HR-shaped.
- Add a portal `identity_users` row for every active aha-fast `User` whose email is not already in portal. Use portal's existing employee provisioning path (CSV import or `/admin/employees` UI), not a one-off script — the same path produces `user.provisioned` webhooks Fast will consume.
- Schema migration in aha-fast (Prisma): add `User.portalSub` column, add `taxonomy_cache`, `email_cache`, `portal_webhook_events` (idempotency dedupe), without touching primary keys.
- Add Fast's portal handoff endpoint at `/api/auth/portal/exchange` (Next.js Route Handler), wire it to upsert by `portalSub`.
- Add Fast's webhook receiver at `/api/webhooks/portal` with HMAC verification, idempotency dedupe, and per-event handler modules under `lib/portal-events/handle-*.ts`.
- Add an `AUTH_MODE=portal|legacy` feature flag in Fast. Both modes resolve to the same `User` row (linked by `portalSub` if set, else by email).
- Identity rekey migration: for each `User` with a non-null `portalSub` differing from `id`, `UPDATE User SET id = portalSub` inside a transaction with `ON UPDATE CASCADE` propagating through all 25 FKs. Verify FK row counts before/after each batch.
- Cutover: flip `AUTH_MODE=portal`. Better-auth tables become read-only. Fast's `/login`, `/register`, `/forgot-password`, Google OAuth, and activation routes return 410 Gone (or redirect to portal).
- 30-day post-cutover read-only retention of better-auth tables, then drop.
- Cleanup: remove better-auth, Google OAuth, activation, password-reset code paths in Fast. Portal owns these now.

**Explicitly out of scope (and why):**

- **Moving Fast's database into portal Cloud SQL.** User-decided; mirrors the Heroes split. Less blast radius, easier rollback, matches the H-app pattern. If a future audit shows three or more H-apps would benefit from a shared DB, the conversation reopens.
- **A new Fast subdomain on the `ahacommerce.net` zone.** Out of scope here; the `coms.ahacommerce.net` portal subdomain is itself still pending (per memory). Fast keeps its current Cloud Run URL throughout this spec. A subdomain swap is a separate operational change with no schema implications.
- **Migrating Fast's Google Calendar / Google Chat / Google Sheets integrations off their per-user Google OAuth tokens.** The `google_tokens` table stays as-is; it FKs `User.id` and follows the rekey transparently. Portal does not manage per-app third-party OAuth tokens — that's a separate spec if and when it's needed.
- **Re-architecting Fast's role model.** Fast has `User.role` (`leader` | `member`) and we will mirror this exactly into portal's `appConfig` schema for Fast. We do **not** flatten Fast's role into portal's identity layer — per `project_heroes_role_refactor.md`, app-local role lives in the projection table (`heroes_profiles.role`), surfaced through `envelope.appRole`, never in identity. Fast follows the same invariant.
- **Replacing Fast's local presence / activity tracking** (`activeSecondsToday`, `lastSeenAt`, `UserActivityDaily`). These are app-domain state Fast computes from heartbeats; portal does not own them. They follow the rekey transparently.
- **Migrating channel/message history to a portal-owned chat system.** Fast's chat is fast-domain; portal does not have a chat surface and is not getting one in this spec.
- **A Fast-specific webhook event taxonomy.** Fast subscribes to the existing portal events Heroes already consumes. If Fast needs an event Heroes doesn't (none identified yet), it ships as a portal-side additive change, not as part of this spec.

---

## Phasing

Six phases. Each is independently revertible until the one after it ships. Phase 4 (the rekey) is the one with no rollback after commit; everything before it is additive and everything after it is cleanup.

### Phase 0 — Pre-flight  *(SHIPPED 2026-05-08; see `spec-07-artifacts/`)*

**Goal:** capture the rollback insurance and surface every data-shape problem before any code ships.

PRs: none. Operational only.

Steps:

1. `pg_dump --format=custom` of Fast's Cloud SQL instance. Stored in a long-retention bucket (separate from the daily backup rotation, which can age out before this migration completes).
2. Email inventory: `SELECT email FROM "user"` from Fast Postgres minus `SELECT email FROM identity_user_emails` from portal Postgres. The difference is the orphan set.
3. Duplicate-email inventory: any aha-fast `User.email` that resolves to multiple `identity_users` in portal (shouldn't happen, but verify). Any aha-fast `User.email` with the same case-folded form as another aha-fast `User.email` (shouldn't happen, but verify before we treat email as the join key).
4. FK row counts per dependent table, captured to a `migration_baseline.csv` artifact that ships with each phase's PR description for before/after comparison.
5. Cloud SQL role inventory (resolves Q3): list DB roles on Fast's instance and their grants. If only one role exists for both runtime traffic and migrations, flag for Phase 5B scope expansion. If two roles exist (e.g., `app_runtime` + `app_migrator`), Phase 5B can target the runtime role's grants directly.

**Exit criteria:** orphan list and duplicate list are both either empty or triaged. `pg_dump` exists and a restore-to-staging dry-run has succeeded.

### Phase 1 — Portal side: register Fast and provision orphans (additive, ships first)  *(SHIPPED 2026-05-08; see `spec-07-artifacts/3-phase-1-end-state.md`)*

**Goal:** portal becomes ready to host Fast's identities and emit the events Fast will consume; no Fast code changes yet.

PRs (all in `mrdoorba/coms_portal`):

| PR | Scope |
|----|---|
| 1A | App Registry row for Fast: `apps` insert + `app_manifests` insert via the App Registry admin UI (per `project_app_onboarding_model.md`, registration + manifest land in one txn). **The slug is chosen here by the admin at registration time** — not pre-decided in this spec. Once chosen, it propagates as `PORTAL_APP_SLUG` env on Fast and as the path segment in `coms-portal-cli smoketest <slug>`. Manifest defines `appConfig` schema (`role`, `teamId`), `appRoles` taxonomy (`employee`, `leader`, `admin`), `requiredEnv` (PORTAL_ORIGIN, PORTAL_APP_SLUG, PORTAL_SERVICE_ACCOUNT_EMAIL, SELF_PUBLIC_URL — same shape as Heroes). |
| 1B | Webhook endpoint registration in `app_webhook_endpoints` for the new app pointing at `<fast-cloud-run-url>/api/webhooks/portal`. Subscribes to the eight Heroes-consumed events: `user.provisioned`, `user.updated`, `employment.updated`, `user.offboarded`, `app_config.updated`, `alias.updated`, `taxonomy.upserted`, `taxonomy.deleted`. |
| 1C | Provisioning sweep: drive Phase 0's orphan list through portal's existing employee provisioning. Emits `user.provisioned` events but Fast's webhook endpoint is not active until Phase 3, so the events go to DLQ. That's fine — Fast replays from DLQ on webhook activation. Alternatively (and preferred), pause emission for Fast's endpoint until Phase 3 (admin UI toggle). |

**Exit criteria:** portal has an `identity_users` row for every active aha-fast `User`. Fast app row is `status='active'` in App Registry. Smoketest verb (`coms-portal-cli smoketest <slug>`) returns OK on (1) registry check and fails on (2) URL reachable + (3) webhook delivery — that's expected pre-Phase-3.

**Rollback:** disable the Fast app row (`status='inactive'`), delete the manifest. Provisioned identities stay (they're additive and harmless to portal-only consumers).

### Phase 2 — Fast schema migration (Prisma, reversible at this stage)

**Goal:** Fast's DB acquires the columns and tables it needs to participate as an H-app, without touching primary keys or breaking the live app.

PRs (all in `mrdoorba/aha-fast`):

| PR | Scope |
|----|---|
| 2A | Prisma migration: add `User.portalSub TEXT UNIQUE NULL`, add `User.accountStatusReason TEXT NULL` (for marking unmatched-orphan state). No FK changes. App keeps working on `User.id` exactly as before. |
| 2B | Prisma migration: add tables `taxonomy_cache (taxonomyId, key, value, metadata, cachedAt)`, `email_cache (portalSub, contactEmail, cachedAt)`, `portal_webhook_events (eventId PK, processedAt)`. Mirrors the Heroes pattern from `coms_aha_heroes/CONTEXT.md`. |
| 2C | Backfill `User.portalSub` from email join: ```UPDATE "user" SET "portalSub" = (SELECT iu.id FROM portal_identity_users_export iu WHERE iu.email = "user".email)```. The `portal_identity_users_export` is a one-shot CSV/import, not a live FDW; we don't need a runtime portal connection from Fast for this step. After this PR, every active Fast `User` has a non-null `portalSub`. |

**Exit criteria:** `SELECT count(*) FROM "user" WHERE "portalSub" IS NULL AND "accountStatus" = 'active'` returns 0.

**Rollback:** Prisma migration down (drops the column + tables). No data lost; live app never read these columns.

### Phase 3 — Fast wires up portal (parallel-run, both auth modes work)

**Goal:** Fast can authenticate users via portal handoff and consume portal webhooks. Better-auth still works. Both flows resolve to the same `User` row.

PRs (all in `mrdoorba/aha-fast`):

| PR | Scope |
|----|---|
| 3A | Add `app/api/auth/portal/exchange/route.ts` — Next.js Route Handler that receives `portal_code` from the broker launch redirect, exchanges it for a portal session, upserts `User` keyed by `portalSub` from the handoff payload (preserves existing `User.id` if a row already exists with that `portalSub`), and mints a Fast better-auth session. Pattern: same as Heroes' `packages/web/src/routes/auth/portal/exchange/+server.ts` (treat handoff as a portal-authenticated upsert path). |
| 3B | Add `app/api/webhooks/portal/route.ts` — HMAC-verified, idempotency-deduped via `portal_webhook_events`. Dispatches to `lib/portal-events/handle-<event-name>.ts` modules (one per event type Heroes consumes). Initial handlers are minimal: `user.provisioned` upserts `User` (no-op if row already exists with that `portalSub`); `user.updated` patches name/avatar; `user.offboarded` flips `accountStatus = 'offboarded'`; `employment.updated` is a no-op for Fast (Fast doesn't display HR fields); `app_config.updated` patches `User.role` and `User.teamId`; `taxonomy.upserted/deleted` updates `taxonomy_cache`; `alias.updated` is a no-op. |
| 3C | Add `AUTH_MODE` env var to Fast (`portal` \| `legacy` \| `dual`, default `dual`). Login page in dual mode shows both "Sign in with Portal" and the existing email/password form. Server-side session resolution checks both better-auth session cookie and portal session cookie; either yields a logged-in user, both resolve to the same `User` row by `portalSub` (preferred) or email (fallback). |
| 3D | Smoketest the integration end-to-end with `coms-portal-cli smoketest <slug>`. Should pass all three steps. |

**Exit criteria:** Fast staging environment in `AUTH_MODE=dual` accepts both legacy and portal logins. A portal-side `app_config.updated` for a Fast user updates `User.role` in Fast within webhook latency. A new portal-provisioned employee can log into Fast via portal handoff and see an empty `User` row materialized. `coms-portal-cli smoketest <slug>` returns OK.

**Rollback:** flip `AUTH_MODE=legacy`, remove the route files. Better-auth tables untouched throughout this phase.

### Phase 4 — Identity rekey (the careful part, irreversible after commit)

**Goal:** every Fast `User` row's primary key becomes its `portalSub`. All FK references update via `ON UPDATE CASCADE`. After this phase, `User.id === User.portalSub` for every active row, and Fast's identity layer is structurally aligned with Heroes.

**Pre-flight checks (all must be GREEN before Phase 4 PR is merged):**

- `pg_dump` from Phase 0 exists and a staging restore has been verified within the last 7 days.
- Phase 3 has been live in production for ≥ 7 days with `AUTH_MODE=dual`. No identity-shaped bugs in that window.
- Every active `User.portalSub` is non-null (Phase 2's exit criterion re-verified the morning of Phase 4).
- `bun test` (or `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma`) is clean against staging.

PRs (all in `mrdoorba/aha-fast`):

| PR | Scope |
|----|---|
| 4A | Prisma migration: alter every FK that references `User.id` to add `ON UPDATE CASCADE`. Prisma maps `onUpdate: Cascade` on each relation. Generated migration is mechanical — one `ALTER CONSTRAINT` per FK, ~25 statements, no data movement. Test on staging restore from Phase 0 dump first. |
| 4B | The rekey itself, executed via a maintenance-window script (`scripts/rekey-to-portal-sub.ts`) rather than a Prisma migration — Prisma migrations don't naturally express "UPDATE pk = column" idempotently across batches. Script: BEGIN; `LOCK TABLE "user" IN EXCLUSIVE MODE`; `UPDATE "user" SET id = "portalSub" WHERE id <> "portalSub" AND "portalSub" IS NOT NULL`; capture FK row counts in every dependent table before/after via the `migration_baseline.csv` from Phase 0; assert deltas are zero; COMMIT. Wraps in a single transaction so a constraint violation aborts the whole rekey. Maintenance window: ~10 min for the lock + UPDATE, plus verification reads. |
| 4C | Prisma migration: make `User.portalSub NOT NULL` and add a `CHECK (id = "portalSub")` constraint to enforce the invariant going forward. Drop the now-redundant `UNIQUE` index on `portalSub` (covered by the PK now). |

**Exit criteria:** `SELECT count(*) FROM "user" WHERE id <> "portalSub"` returns 0. Every per-table FK row count in `migration_baseline.csv` matches post-rekey. End-to-end smoke: a known user logs in, sees their tasks, channels, messages, notes, and milestones intact.

**Rollback:** restore from Phase 0 `pg_dump`. There is no in-place rollback after 4B commits; the previous primary keys are gone. This is why Phase 4A and 4C are separate PRs (each independently reversible) and 4B is a script run during a scheduled maintenance window with you on the call.

### Phase 5 — Cutover

**Goal:** portal is the only authentication path for Fast. Better-auth tables go read-only.

PRs (all in `mrdoorba/aha-fast`):

| PR | Scope |
|----|---|
| 5A | Flip default `AUTH_MODE=portal`. `/login`, `/register`, `/forgot-password`, Google OAuth callback, `/activate` either redirect to the portal-handoff URL or return 410 Gone (decision: redirect, with a one-time banner explaining the change). |
| 5B | Database role grants: revoke INSERT/UPDATE on `Session`, `Account`, `Verification` for the Fast app's runtime DB role. Better-auth tables become read-only. (We don't drop them — that's Phase 6 after the 30-day window.) |
| 5C | Audit log: every authenticated action records both `User.portalSub` and the portal session id. Existing `ActivityLog` rows are unchanged; new rows include the portal session reference. |

**Exit criteria:** No new rows in `Session` / `Account` / `Verification` for ≥ 24 h. All active Fast users have a portal session. Telemetry dashboard shows zero legacy-auth login attempts.

**Rollback:** flip `AUTH_MODE=dual`, restore the DB role grants. Better-auth still works during the 30-day window.

### Phase 6 — Cleanup (T+30 days post-cutover)

**Goal:** remove the better-auth scaffolding and dead-code paths Fast no longer uses.

PRs (all in `mrdoorba/aha-fast`):

| PR | Scope |
|----|---|
| 6A | Drop `Session`, `Account`, `Verification`, `ActivationToken`, `PasswordResetToken` tables. Remove `lib/auth.ts`, `lib/auth-server.ts`, `lib/auth-client.ts`, `lib/auth-context.tsx` (replace with a thin portal-session wrapper). Remove `app/api/auth/{register,activate,forgot-password,reset-password,google}` route handlers. |
| 6B | Remove `User` columns made redundant by portal: `email` (read from `email_cache` keyed by `portalSub`), `name` (from portal handoff payload), `image` / `avatar_url` (same), `emailVerified` (portal-owned). Keep `role`, `teamId`, `accountStatus`, `lastSeenAt`, `activeSecondsToday`, `activeDate`, `totalActiveSeconds`, `lastChangelogSeenAt` — these are Fast-domain. |
| 6C | Rename `User` → `fast_profiles` to mirror `heroes_profiles` (per the H-app naming convention established in Spec 03). Drizzle-style: a single migration generated by `prisma migrate dev`, no hand-edited SQL, no journal hand-edits (per `feedback_drizzle_migrations.md` — Prisma doesn't have the same journal sequencing bug, but the principle "don't hand-write migration metadata" still applies). |

**Exit criteria:** `grep -r "better-auth" .` returns nothing in `aha-fast/`. The Fast schema's identity layer matches Heroes' `heroes_profiles` shape (modulo Fast-specific domain columns). The `coms-portal-cli smoketest <slug>` still returns OK.

**Rollback:** none meaningful at this point — better-auth is gone. The 30-day window in Phase 5 is the last rollback opportunity.

---

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Phase 4B fails mid-transaction with a deadlock or constraint violation, leaving the DB in an inconsistent state. | Low | High | Single transaction rollback semantics. Pre-test on staging dump. Maintenance window with traffic paused. |
| R2 | Email-based join in Phase 2C produces a wrong match (case sensitivity, alias collision, two portal identities for one Fast email). | Medium | Medium | Phase 0 §3 explicitly enumerates duplicates and aborts if any are found. Email join is case-folded. Verified manually before Phase 2C runs. |
| R3 | A Fast `User` exists with no `email` set (data quality issue) and Phase 2C leaves their `portalSub` null. | Low | Medium | Phase 0 §2 surfaces these. They get triaged: either filled in manually, or marked `accountStatus='pending_portal_link'` and excluded from Phase 4's rekey filter. They keep their legacy `User.id` and cannot log in until their portal identity is resolved. |
| R4 | Fast user logs in via legacy auth during Phase 3 dual-mode and creates a new better-auth row that doesn't match a portal identity (e.g., a forgotten-password reset for an account portal doesn't know about). | Medium | Low | Dual-mode login flow: if better-auth resolves a `User` with no `portalSub`, the post-login middleware enqueues a portal-side provisioning request and shows a "linking your account" page until the webhook arrives. Should be ~seconds, not minutes. |
| R5 | Webhook DLQ fills up during Phase 1C if Fast's endpoint is registered before Phase 3 ships. | Low | Low | Phase 1B explicitly registers the endpoint in *paused* state. Phase 3D unpauses it. DLQ replay handles the backlog. |
| R6 | Cloud SQL connection limits exceeded during the rekey (the script holds an EXCLUSIVE lock; concurrent app traffic queues). | Low | Medium | Maintenance window, traffic paused, app health probe disabled for the window's duration. Window scheduled in advance, communicated to users. |
| R7 | Better-auth `Session` rows have non-portalSub-shaped `userId` values that `ON UPDATE CASCADE` will rewrite, breaking active sessions. | High | Low | Expected and acceptable. All active sessions invalidate; users re-login via portal handoff. Document in the user-facing maintenance notice. |
| R8 | Portal-side webhook contract changes during the multi-week rollout (Spec 03 ships, e.g., and changes the JWT shape). | Low | Medium | Pin `@coms-portal/sdk` to a specific version in Fast's `package.json` at the start of Phase 3. Bump intentionally, with awareness, between phases. |

---

## Acceptance criteria

1. Every active aha-fast `User` row's primary key equals its `portalSub` (= portal `identity_users.id`) post-Phase-4.
2. Every FK row count per dependent table matches `migration_baseline.csv` from Phase 0.
3. `coms-portal-cli smoketest <slug>` returns OK after Phase 3D and after every subsequent phase.
4. Fast's `/login`, `/register`, `/forgot-password`, `/activate`, Google OAuth callback are all unreachable for normal users post-Phase-5A (redirect or 410).
5. `grep -r "better-auth" .` in `aha-fast/` returns nothing post-Phase-6A.
6. A new portal-provisioned employee gets a `User` row in Fast on their first login (via webhook materialization or just-in-time upsert in the handoff endpoint).
7. A portal-side `app_config.updated` for a Fast user updates `User.role` and `User.teamId` in Fast within webhook latency (< 10 s in staging, < 60 s in production under normal load).
8. A portal-side `user.offboarded` for a Fast user flips `User.accountStatus = 'offboarded'` and the user can no longer log in; their tasks, channels, and messages remain intact (no FK delete cascades fire on offboarding — that's `accountStatus`-driven, not row deletion).
9. Zero data loss from Phase 0's `pg_dump` baseline (verified via row-count and selected sample-row equality across every domain table).

---

## Open questions

- **Q1.** Should Fast's webhook endpoint subscribe to `email.updated` (Spec 06's dual-email events) at registration time, or wait for a Fast feature that needs it? **Tentative answer:** subscribe now. Zero handler logic (the `email_cache` projection is enough); future Fast features get the data for free.
- **Q2.** Does Fast want to surface the portal account-widget (Rev 3 Spec 02 outcome) inside its app shell? **Tentative answer:** yes, but as a follow-up to Spec 07 — Phase 6 deliberately doesn't touch UI surfaces, only the auth/identity plumbing.
- **Q3.** Phase 5B revokes write grants on better-auth tables. Does the Fast app's runtime DB role have a separate user from migration-time grants? If not, we need a second DB role for migrations to keep the runtime role limited. **Resolution:** unknown at spec time; add a Phase 0 step to inspect Fast's Cloud SQL role layout and report back. If only one role exists, Phase 5B's PR scope expands to include role split. Not a spec-time blocker — Phase 0 is the discovery step.
- **Q4.** What happens to Google OAuth connections (`google_tokens` table) at Phase 5? Users authenticated via Google get a portal session, but their stored Google access/refresh tokens are still keyed by `User.id` (= `portalSub` post-rekey). **Tentative answer:** unchanged. The token is tied to the user's identity, not their auth provider. Rekey carries it transparently. New Google connections after Phase 5 use the existing `google_tokens` upsert path.

---

## Decisions log

| # | Date | Decision | Rationale |
|---|---|---|---|
| D1 | 2026-05-08 | Auto-provision orphan portal identities (vs. blocking on manual triage). | User-approved. Zero data loss and zero blocked users at the cost of a one-time portal-side provisioning sweep that's already a documented operation. |
| D2 | 2026-05-08 | Fast keeps its own Cloud SQL + Cloud Run (vs. consolidating into portal infra). | Mirrors Heroes pattern. Less blast radius. Easier rollback. The H-app contract is "consume portal identity," not "share portal infrastructure." |
| D3 | 2026-05-08 | Sequenced PRs by phase (vs. one bundled PR per side). | Each phase is independently revertible. Spec 06 narrowed similarly; the "one bundled PR" alternative loses the rollback granularity Phase 4 specifically needs. |
| D4 | 2026-05-08 | Spec-first (vs. straight to Phase 0). | This is a multi-week, multi-PR, identity-rekey-with-live-data spec. Writing the contract first lets the user catch shape problems before any code goes near the rekey. |
| D5 | 2026-05-08 | `User.id = portalSub` rekey via `ON UPDATE CASCADE` (vs. dual-id columns with a long deprecation). | The dual-column alternative leaves Fast permanently carrying two ids per user, with every code path having to remember which one is "the real one." Rekey is a one-time pain trading for a clean post-state. |
| D6 | 2026-05-08 | Better-auth `Session`/`Account`/`Verification` tables read-only for 30 days post-cutover (vs. immediate drop). | Rollback insurance. Phase 5 is the last "true" rollback point; the 30-day window costs nothing and bounds the incident response if a Phase-6-discovered bug requires reverting auth. |
| D7 | 2026-05-08 | Per-app role lives in Fast's `User.role` populated by `appConfig` webhooks, surfaced through `envelope.appRole` (vs. flattening into portal identity). | Per `project_heroes_role_refactor.md` — app-local role is an H-app invariant. Future H-apps follow the same pattern. |

---

## Cross-references

- Heroes precedent: `coms_aha_heroes/CONTEXT.md`, `coms_aha_heroes/portal.integration.json`.
- App onboarding model: `project_app_onboarding_model.md` (auto-memory).
- Webhook envelope invariants: `feedback_webhook_dual_emit.md` (auto-memory).
- Heroes role refactor: `project_heroes_role_refactor.md` (auto-memory).
- Spec 06 (Onboarding scaffolding): `docs/architecture/rev4/spec-06-onboarding-scaffolding.md` — Spec 07 is the first real consumer of Spec 06's deliverables.
- Spec 03 (HS256 rip-out): `docs/architecture/rev4/spec-03-hs256-rip-out.md` — does **not** gate Spec 07; Fast adopts post-rip surface from day one regardless.
