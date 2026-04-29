# Architecture Decision Record — COMS Portal

> Indexed: 2026-04-28 · 5722 nodes · 6846 edges
> Last update: Rev 3 portal-side §01 + §02 (Phases 1–3) + §03 shipped 2026-04-28 (12 effects across alias layer, per-app config, admin UIs, webhooks, gated REVOKE migration; commits `7ca0a2e`…`e0bbebe`). Spec 03b test-gate cleanup: all 261 API tests passing locally; CI deploy gate ready to unblock.

## 1. System Overview

**COMS Portal** is an internal admin portal that brokers identity and access across a suite of relying-party "COMS" apps (Heroes today). The portal owns:

- Employee/team CRUD and provisioning
- Per-app access grants
- An auth-broker that issues short-lived signed tokens to relying-party apps (HS256 + ES256 dual-mode after Rev 2 §01)
- An OIDC-recognizable IdP surface (`/.well-known/jwks.json`, `/.well-known/openid-configuration`, `/api/userinfo`, RP-initiated logout) for stock OIDC clients
- Webhook fanout to relying parties on user lifecycle events (HMAC + Google OIDC dual-mode after Rev 2 §03; Rev 3 added `alias.*` and `app_config.updated` events)
- A Google Sheets ↔ portal employee-info sync
- **Sole-writer semantics for `identity_users`** (Rev 3 §03) — a portal-owned alias layer brokers name-based resolution from relying-party ingestion, and a gated DB-role REVOKE prepares Heroes to lose direct write privileges at cutover
- **Per-app user config** stored centrally — manifests register per-app schemas, `app_user_config` rows are seeded inside `createEmployee`, and `app_config.updated` webhooks fan changes out

Single Cloud Run service today. Shared client libraries (`@coms-portal/shared`, `@coms-portal/design-tokens`, `@coms-portal/ui`, `@coms-portal/account-widget`) live in standalone GitHub repos and are consumed via `git+https://…#vX.Y.Z`.

## 2. Tech Stack & Top-Level Layout

- **Monorepo** — Bun workspaces (`apps/*`)
- **API** — `apps/api`: Elysia + Bun runtime, Drizzle ORM, Postgres (Cloud SQL), `jose` for JWTs (HS256 + ES256), `google-auth-library` for Secret Manager REST + OIDC ID tokens, Firebase/GIP for identity
- **Web** — `apps/web`: SvelteKit on `adapter-node` (SSR-on after Rev 1 §05 carryover closed 2026-04-27), Tailwind v4, TanStack Query, Eden (Elysia client), Firebase client SDK for Google sign-in. Consumes `@coms-portal/account-widget` v0.1.0, `@coms-portal/design-tokens` v1.0.0, `@coms-portal/ui` v1.0.0, and `@coms-portal/shared` v1.3.0 (web pin lags API by one minor — API is on v1.4.0 for Spec 03 event types)
- **Shared (auth contracts)** — `@coms-portal/shared` (`mrdoorba/coms-shared#v1.4.0`)
- **Shared (UX)** — `@coms-portal/account-widget` (`mrdoorba/coms-account-widget#v0.1.0`), `@coms-portal/design-tokens` (`mrdoorba/coms-design-tokens#v1.0.0`), `@coms-portal/ui` chrome (`mrdoorba/coms-ui#v1.0.0`)
- **Infra** — `infra/`: OpenTofu/Terraform — Cloud Run, Cloud SQL, Cloud Tasks, Artifact Registry, Workload Identity Federation, Secret Manager (per-app + broker signing keys), IAM (`iam-signing-keys.tf` for Cloud Run SA → `portal-broker-signing-key-*` admin)
- **Tests** — `tests/e2e/` Playwright; `apps/api/src/__tests__/`, `apps/api/src/middleware/__tests__/`, `apps/api/src/routes/__tests__/`, and `apps/api/src/services/__tests__/` Bun test (33 test files API-side / 261 tests as of 2026-04-28, locally green post-Spec-03b). Shared mock helpers at `apps/api/src/test-helpers/schema-barrel-mock.ts`
- **Architecture specs** — `docs/architecture/rev1/spec-00..05` + `docs/architecture/rev2/spec-00..05` + `docs/architecture/rev3/spec-00..05` + `spec-03b-test-gate-cleanup.md` + Heroes handoff docs

## 3. Major Components (apps/api/src)

| Folder | Role |
|---|---|
| `routes/` | Elysia route modules: `auth`, `employees`, `teams`, `apps`, `access`, `dashboard`, `employee-info-sync`, `app-webhooks`, `admin`, `well-known` (Rev 2 §01-§02), `userinfo` (Rev 3 §01 — `GET /api/userinfo`), `internal` (Cloud Tasks delivery callbacks), **`aliases`** (Rev 3 §03 — `POST /api/aliases/resolve-batch`), **`users`** (Rev 3 §03 — `GET /api/users/:portalSub/config/:appId`), `admin/signing-keys` (Rev 2 §01), **`admin/alias-queue`** (Rev 3 §03 — collision queue admin), **`admin/app-config`** (Rev 3 §03 — single edit + selection-bulk + CSV-bulk preview-then-commit) |
| `middleware/` | `auth` (session cookie → user), `rbac`, `session-cookie`, **`app-token`** (Rev 3 §03 — `requireAppToken()` Elysia plugin verifying inbound Google OIDC tokens against `app_registry.service_account_email`) |
| `services/` | Business logic: `auth-broker` (dual-mode HS256+ES256 minting), `employees`, `employee-provisioning` (extended in Rev 3 §03 to seed `app_user_config` defaults inside the `createEmployee` transaction and to include the `appConfig` slice in `user.provisioned` events), `employee-import`, `employee-info-sync`, `teams`, `apps`, `audit`, `claims`, `name-matching`, `portal-webhook-fanout`, `webhook-dispatcher` (dual-mode HMAC+OIDC), `provisioning-events`, `health-probe`, `session-revocation`, `sheets-client`, `signing-keys` (Rev 2 §01), `oidc-verifier` (Rev 1 §05 + Rev 2 §03 wrapper `verifyGoogleIdToken`), **`aliases`** (Rev 3 §03 — resolve, two-step rename, Levenshtein-or-token-set collision detection), **`alias-events`** (Rev 3 §03 — `alias.resolved` / `alias.updated` / `alias.deleted` emitters), **`app-user-config`** (Rev 3 §03 — read/write of `app_user_config` rows), **`app-user-config-events`** (Rev 3 §03 — `app_config.updated` emitter with per-app slice filtering), **`manifests`** (Rev 3 §03 — manifest validation + idempotent boot registration; Heroes manifest seed at `services/manifests/heroes.json`), `cloud-tasks-client` |
| `db/schema/` | Drizzle: `identity-users`, `teams`, `apps` (`app_registry`; with Rev 2 §04 `service_account_email` column, `introspect_secret` column dropped 2026-04-27 in mig 0021), `app-webhook-endpoints`, `webhook-delivery-jobs`, `auth-handoffs`, `audit`, `session-revocations`, `signing-keys` (Rev 2 §01), **`user-aliases`** (Rev 3 §03 — `user_aliases` with PG `GENERATED ALWAYS AS` `alias_normalized` column), **`alias-collision-queue`** (Rev 3 §03), **`app-manifests`** (Rev 3 §03), **`app-user-config`** (Rev 3 §03), **`bulk-edit-locks`** (Rev 3 §03 — single-row PK by `app_id`, advisory mutex for bulk edits) |
| `scripts/` | One-shot CLIs: `bootstrap-signing-key.ts` (Rev 2 §01, idempotent first-key mint, CI-wired) |
| `db/migrations/cutover/` | Manually-applied migrations gated outside the auto-migrate flow. Rev 3 §03 added `0001_revoke_heroes_writes.sql` — REVOKE Heroes' DB-role write privileges on `identity_users`. NOT applied by `db:migrate`; runs only at the coordinated Heroes cutover window |

API is mounted at `/api`. Routes outside the `/v1` group: `/api/health`, `/api/.well-known/jwks.json`, `/api/.well-known/openid-configuration`, `/api/userinfo`, the `auth/*` broker subroutes (`/auth/broker/launch/:appSlug`, `/broker/exchange`, `/broker/introspect`, `/broker/handoff`, `/auth/session`, `/auth/logout` — RP-initiated logout, `/auth/me`), `/api/internal/*` (Cloud Tasks delivery callbacks), `/api/aliases/resolve-batch`, and `/api/users/:portalSub/config/:appId`. The `/api/v1/*` group is auth-gated (session cookie) and includes employee/team/app/access/dashboard/sync/webhook routes plus `/v1/admin/signing-keys/rotate`, `/v1/admin/alias-queue/*`, `/v1/admin/app-config/*`.

## 4. Key Architectural Decisions

### 4.1 Auth Broker — portal as IdP for sub-apps
- Portal authenticates the user via Firebase/GIP and a `__session` cookie.
- Relying-party apps redirect users to `/api/auth/broker/launch/:appSlug`; portal mints **dual-mode** broker tokens during the Rev 2 transition window:
  - **HS256** (legacy): per-app symmetric secret from `app_registry.broker_signing_secret` with env-var fallback `PORTAL_BROKER_SIGNING_SECRET`. Issuer claim: literal string `'coms-portal-broker'`.
  - **ES256** (new): asymmetric, signed with the portal's global private key (stored in Secret Manager). Issuer claim: URL-form `${PORTAL_PUBLIC_ORIGIN}/broker`. Public verification keys are served from `GET /api/.well-known/jwks.json`.
- Both tokens travel as siblings on the launch redirect URL (`portal_token` + `portal_token_es256` query params) and on the exchange response payload (`token` / `tokenHs256` / `tokenEs256`). Heroes verifies whichever it can.
- The verifier (`exchangeBrokerHandoff` in `auth-broker.ts`) accepts an array of issuers `[PORTAL_BROKER_ISSUER, LEGACY_PORTAL_BROKER_ISSUER]` so tokens minted with either issuer continue verifying through the dual-mode period.
- Signing key state lives in `portal_broker_signing_keys` (kid PK; status `active`/`retiring`/`retired`; partial unique index `one_active_signing_key`). Service `services/signing-keys.ts` exposes `generateAndStoreNewKey`, `loadActiveSigningKey` (5-min in-process KeyLike cache), and `rotateActiveKey` (transactional active→retiring flip).
- Bootstrap of the first ES256 key runs idempotently in CI via `apps/api/scripts/bootstrap-signing-key.ts` (`.github/workflows/deploy.yml` step "Bootstrap broker signing key", env var `GCP_PROJECT_ID` from repo variable).
- Manual rotation via `POST /api/v1/admin/signing-keys/rotate` (admin-authed). Cloud Scheduler 90-day rotation cron is documented but not yet wired (follow-up infra ticket).
- OIDC discovery document at `GET /api/.well-known/openid-configuration` advertises `issuer`, `jwks_uri`, `id_token_signing_alg_values_supported: ['ES256']`, the broker/introspect endpoints, the **`userinfo_endpoint`** (`/api/userinfo`, Rev 3 §01), and the **`end_session_endpoint`** (`/api/auth/logout`, Rev 3 §01) — stock OIDC clients can verify against the portal with no bespoke code.
- **Introspect endpoint** at `POST /api/auth/broker/introspect` is **OIDC-only** as of commit `96395a1` (2026-04-27). `authenticateIntrospectCaller` requires `Authorization: Bearer <google-id-token>` and verifies the token's `email` claim against `app_registry.service_account_email`. Auth failures emit a structured `[introspect] auth_failed app:<slug> reason:<…>` log (`app_not_found` / `sa_not_configured` / `missing_bearer` / `verify_failed`); the client always sees a generic 401 to avoid leaking app or config state. The legacy `x-portal-introspect-secret` header, the `app_registry.introspect_secret` column (mig 0021), the `PORTAL_INTROSPECT_SECRET` env var, and the corresponding Secret Manager secret + IAM grant are all removed.

### 4.2 Webhook Fanout — Cloud Tasks + dual-mode auth (HMAC + Google OIDC)
- `webhook-dispatcher.dispatchPortalWebhook` queries active endpoints, attempts inline POST, and on failure enqueues a Cloud Tasks retry (Rev 1 §05 retired the in-process worker).
- **Outbound auth is dual-mode (Rev 2 §03):** every webhook fetch carries both:
  - `Authorization: Bearer <google-id-token>` — token minted via `GoogleAuth.getIdTokenClient(audience)` with `audience = new URL(endpoint.url).origin`. Heroes verifies via `OAuth2Client.verifyIdToken` against Google's JWKS and asserts `email === PORTAL_SERVICE_ACCOUNT_EMAIL`.
  - Legacy HMAC headers (`X-Portal-Signature`, `X-Portal-Timestamp`, `X-Portal-Event-Id`, `X-Portal-Event`) — preserved for backwards compatibility until Heroes ships H2 and we run Day-30 cleanup.
- **Graceful degradation:** if the GCP metadata server is unreachable, `mintWebhookAudienceToken` returns `null` and the dispatcher proceeds with HMAC-only emission rather than crashing. Logged at WARN.
- Cloud Tasks retries (3 attempts, exponential backoff) configured via Terraform; OIDC verifier at `services/oidc-verifier.ts` handles the inbound side for Cloud Tasks delivery callbacks (`/api/internal/*`).
- **Rev 3 §03 added events:** `alias.resolved`, `alias.updated`, `alias.deleted` (emitted from `alias-events.ts`), and `app_config.updated` (emitted from `app-user-config-events.ts` with per-app slice filtering — recipients only receive their own app's slice). `user.provisioned` payload extended additively with optional per-recipient `appConfig` slice. Wire-format types ship in `@coms-portal/shared` v1.4.0.

### 4.3 Health Probe — in-process interval today
- `startHealthProbeInterval()` runs as `setInterval` alongside the API.
- Cloud Scheduler migration is **deliberately deferred** at current scale (one relying-party app, daytime traffic). The failure modes Cloud Scheduler would fix — silent stop on Cloud Run scale-to-zero, duplicate probes on multi-instance — are theoretical today. Revisit when either a 2nd app onboards or staleness is observed in the admin UI during idle hours. See `docs/architecture/rev2/spec-00-implementation-timeline.md` §"Rev 1 Carryover".

### 4.4 Web App: SSR (Rev 1 §05 closed 2026-04-27)
- `apps/web` runs on `@sveltejs/adapter-node`. `apps/web/src/routes/+layout.ts` no longer disables SSR; SvelteKit defaults to SSR-on for the layout.
- Auth gate via the `(authed)` route group — server-side validation prevents the flash of unauthenticated content the previous static-SPA implementation suffered from.
- Rev 3 §01 (account widget) and Rev 3 §02 (design tokens + UI chrome) shipped portal-side dogfooding the standalone `@coms-portal/*` packages.

### 4.5 Drizzle Migrations — generated only
- **Project rule (CLAUDE.md):** never hand-write migrations or `meta/_journal.json` entries. Always `drizzle-kit generate` so `when` timestamps stay correct (Drizzle uses high-water-mark comparison; manually-set timestamps cause silent skips in prod).
- Data-only migrations: make a trivial schema annotation change (e.g. `_backfill_marker` column) to force `drizzle-kit generate`, then replace SQL content in the generated `.sql` file. Drop the marker in a follow-up migration with `IF EXISTS`.
- Migrations run via CI (`bun run --cwd apps/api db:migrate`) with Cloud SQL Auth Proxy, immediately followed by the idempotent `bootstrap-signing-key.ts` step.
- **Cutover migrations** (`db/migrations/cutover/*.sql`) are NOT auto-applied — they run manually during coordinated cutover windows. Rev 3 §03 added `0001_revoke_heroes_writes.sql`.
- Latest migrations:
  - `0019_natural_roxanne_simpson.sql` — `portal_broker_signing_keys` table (Rev 2 §01)
  - `0020_bitter_polaris.sql` — `app_registry.service_account_email` column (Rev 2 §04)
  - `0021_broad_zaran.sql` — drop `app_registry.introspect_secret` column (Day-30 cleanup, 2026-04-27)
  - `0022_dazzling_black_panther.sql` — `user_aliases` + `alias_collision_queue` tables (Rev 3 §03)
  - `0023_purple_red_skull.sql` — `app_manifests` + `app_user_config` + `bulk_edit_locks` tables (Rev 3 §03)
  - `0024_lyrical_charles_xavier.sql` — alias backfill: one `auto_seed` `user_aliases` row per active `identity_users` (Rev 3 §03)
  - `0025_rare_deadpool.sql` — drop the temporary `_backfill_marker` column (idempotent `IF EXISTS`)
  - `0026_robust_apocalypse.sql` — backfill `app_user_config` defaults for active users by `CROSS JOIN` against `app_manifests` defaults (Rev 3 §03)
  - `0027_fuzzy_giant_man.sql` — schema-snapshot no-op cleanup after backfill journal trick

### 4.6 Shared Packages
- **`@coms-portal/shared`** — `mrdoorba/coms-shared`. API on `v1.4.0` (Rev 3 §03 alias + `app_config.updated` event types). Web on `v1.3.0` (Rev 3 §01 widget contracts). Bumps coincide with `PLATFORM_AUTH_CONTRACT_VERSION` increments where applicable. Doc comments in `src/contracts/auth.ts` describe both the legacy literal-string issuer (`'coms-portal-broker'`) and the URL-form issuer (`${ORIGIN}/broker`) so consumers understand why the verifier accepts both during transition.
- **`@coms-portal/account-widget`** v0.1.0 (`mrdoorba/coms-account-widget`) — Rev 3 §01. Shared Svelte component every COMS app embeds for account menu / app switcher / sign-out. Driven by props.
- **`@coms-portal/design-tokens`** v1.0.0 (`mrdoorba/coms-design-tokens`) — Rev 3 §02 Phase 2. Tailwind preset; consumed via `@coms-portal/design-tokens/tailwind`.
- **`@coms-portal/ui`** v1.0.0 (`mrdoorba/coms-ui`) — Rev 3 §02 Phase 3. Chrome components (header/nav scaffolding) only at this version; primitives + compositions are Phase 4 (deferred).

### 4.7 User Identity Ownership & Alias Layer (Rev 3 §03)
- **Portal is the sole writer of `identity_users`.** Relying-party apps must not insert user rows directly. The DB-role REVOKE that enforces this at the engine level is staged at `db/migrations/cutover/0001_revoke_heroes_writes.sql` and applies only at the coordinated Heroes cutover window.
- **Alias resolution.** `user_aliases` carries every name an `identity_user` is known by. The `alias_normalized` column is `GENERATED ALWAYS AS (lower(regexp_replace(trim("alias"), '\s+', ' ', 'g'))) STORED` and is uniquely indexed across the table — collisions are caught at write time by the DB engine, not at the application layer. A partial unique index enforces one `is_primary` alias per user.
- **Two-step rename.** `services/aliases.ts` exposes `renameAlias` as transactional `INSERT` of the new alias + `UPDATE` of `is_primary`, then `DELETE` of the old row in a follow-up step gated on consumer ack via webhook. Avoids a window where neither name resolves.
- **Collision detection.** `services/aliases.ts` runs Levenshtein distance + token-set ratio against existing `alias_normalized` values; near-misses go to `alias_collision_queue` (status `pending`/`resolved`/`rejected`) for human triage in the admin UI at `/admin/aliases`. The queue carries a `context` jsonb blob with the source-app row payload so the admin can pick the right resolution action (`merge`/`create_new`/`reject`).
- **Resolve-batch endpoint.** `POST /api/aliases/resolve-batch` (gated by `requireAppToken`) accepts a list of raw names from a relying-party ingestion job and returns either an `identity_user_id` for each resolved alias or a queue ID for each near-miss. Per-app token-bucket rate limiting prevents one misbehaving consumer from saturating the resolver. Used by Heroes' rewritten sheet ingestion to replace its previous "create user on the fly" path.
- **Per-app config.** `app_manifests` registers a JSON-Schema-shaped `config_schema` per app at boot via `services/manifests.ts` (Heroes' manifest is seeded from `services/manifests/heroes.json`). `app_user_config` carries one row per `(portal_sub, app_id)` pair; defaults are seeded inside the `createEmployee` transaction so a brand-new user always has a config row for every registered app. Backfill for existing users runs in mig 0026.
- **`app_config.updated` webhook.** Per-app slice filtering — when admin edits `{role, leaderboard_eligible}` for app A, only app A's webhook subscribers receive that slice; app B's row in `app_user_config` is untouched and no event is emitted to them.
- **Admin UIs.** `/admin/aliases` (collision queue triage) and `/admin/app-config` (single edit + selection-bulk + CSV-bulk preview-then-commit, with `bulk_edit_locks` enforcing single-active-bulk-per-app).

## 5. External Integrations
- **GIP / Firebase Auth** — primary identity provider (Google Workspace sign-in).
- **Google Sheets API** (`@googleapis/sheets`) — bidirectional employee-info sync.
- **Cloud SQL (Postgres)** via `postgres` driver + Drizzle.
- **Cloud Run** — single deployable service.
- **Cloud Tasks** — webhook delivery retry queue (Rev 1 §05).
- **Secret Manager** — broker private signing keys (`portal-broker-signing-key-*`), per-app `broker_signing_secret` (legacy HMAC, pending Day-30 retirement), GIP API key, DB URL. Accessed via `google-auth-library`'s authenticated REST (NOT the gRPC `@google-cloud/secret-manager` SDK — Bun-unfriendly).
- **Workload Identity Federation** for CI → GCP auth (`infra/wif.tf`).
- **Relying-party apps** — Heroes today; receive ES256 broker tokens, Google-OIDC-authenticated webhooks, and (Rev 3) `app_config.updated` + `alias.*` events. Inbound calls from Heroes (`POST /api/aliases/resolve-batch`, Heroes-side ingestion) authenticate via Google OIDC service-account ID tokens verified by `requireAppToken` against `app_registry.service_account_email`.

## 6. Active Initiatives

**Rev 1 (complete):** Specs 01–05 all merged. Spec 05 Cloud-Scheduler-on-health-probe deliberately deferred at single-app scale.

**Rev 2 portal-side (deployed 2026-04-27, CI run 24977680477):** Specs 01–04 merged + deployed. Spec 05 (stale-serve alerting escalation) is Heroes-only.

**Rev 3 portal-side (shipped 2026-04-28, CI gate red on tests — see Spec 03b):**
1. ✅ Spec 01 — Shared Account Widget — `@coms-portal/account-widget` v0.1.0 published; portal `apps/web` consuming.
2. ✅ Spec 02 — Design System Phases 1+2+3 — `@coms-portal/design-tokens` v1.0.0 + `@coms-portal/ui` v1.0.0 (chrome only). Phases 4+5 (primitives + compositions) deferred until 3rd H-app onboards or drift detected.
3. ✅ Spec 03 — User Identity Ownership & Alias Layer — twelve effects on `main` (commits `b6e3bd1` … `e296ab5`):
   - alias layer (`user_aliases` + PG-generated `alias_normalized` + `alias_collision_queue` + `aliases.ts` service + `POST /api/aliases/resolve-batch` + per-app token-bucket rate limit + `alias.*` webhooks + `/admin/aliases` collision queue UI)
   - per-app config (`app_manifests` + `app_user_config` + `bulk_edit_locks` + `manifests.ts` + Heroes manifest seed + boot registration + default seed inside `createEmployee` + `app_config.updated` webhook with per-app slice filtering + `GET /api/users/:portalSub/config/:appId` + `/admin/app-config` admin UI)
   - inbound app SA token middleware (`requireAppToken`)
   - gated `REVOKE` migration at `db/migrations/cutover/0001_revoke_heroes_writes.sql` (NOT auto-applied)
   - `user.provisioned` payload extended with optional per-recipient `appConfig` slice (additive, no consumer breakage)
   - Mission artefacts at `.nelson/missions/2026-04-28_050010_1b5c498e/`
4. **Spec 03b** — Test-gate cleanup. ✅ Locally green (261 pass / 0 fail). The 55 failing tests on `main` were ALL cross-file mock contamination — every file passed in isolation; the failure surface emerged only under Bun's process-global `mock.module` registry. Resolution shape:
   - **Shared test helper** at `apps/api/src/test-helpers/schema-barrel-mock.ts` exposes `fullSchemaBarrelMock()`, `fullDrizzleOrmMock()`, and `mockSpecs(specs, factory)` — adopted across 7 test files. Eliminates the partial-barrel SyntaxError class (`Export named 'appUserConfig' not found` etc.).
   - **Snapshot+restore pattern**: every test file that mocks a shared service module (`~/services/auth-broker`, `~/services/oidc-verifier`, `~/services/manifests`, `~/services/aliases`, `~/services/session-revocation`, `~/services/claims`) now snapshots the real exports BEFORE mocking, spreads them into the mock, overrides only what the file exercises, and restores via `afterAll`. Applied to `routes/__tests__/userinfo.test.ts`, `routes/__tests__/aliases.test.ts`, `services/__tests__/app-user-config.test.ts`, `middleware/__tests__/app-token.test.ts`.
   - **Prototype-patch over module-mock for vendor SDKs**: `services/__tests__/oidc-verifier-verify-google-id-token.test.ts` patches `OAuth2Client.prototype.verifyIdToken` instead of mocking `google-auth-library`. Module-level mocks of the SDK fail when sibling tests load `oidc-verifier.ts` first (the production `oauthClient` instance is bound at first import); prototype patching is order-independent.
   - **`workspace-sync-removal.test.ts`** Sidebar.svelte assertion deleted (the file was removed in the SvelteKit migration; the surveillance heuristic was brittle).
   - The original three-PR phasing (Class A/B/C) collapsed into a single PR in practice because the contamination root cause was uniform across all 14 failing files. Spec at `docs/architecture/rev3/spec-03b-test-gate-cleanup.md` retained for historical context.
5. Spec 04 — Unified user preferences (theme + locale via `coms_prefs` ID-token claim) — *deferred* until 3rd H-app onboards / drift report / Spec 02 Phase 2+ ships.
6. Spec 05 — Suite search / command palette — *deferred (optional)* until N>6 apps or first cross-app search request.

**Heroes-side (in `coms_aha_heroes`):**
- Rev 2 — H1, H2, H3, H4 — see `docs/architecture/rev2/heroes-team-handoff.md`. H3 gated on populating `app_registry.service_account_email` for the Heroes row before the deploy.
- Rev 3 §01 — Adopt `@coms-portal/account-widget` per `docs/architecture/rev3/heroes-integration-handoff.md`. Independent of the test gate.
- Rev 3 §03 — Phase 0 prep + Phase 1 ingestion rewrite per `spec-03 §Appendix A`. ~2 weeks Heroes engineering. **Cutover (Phase 3) is a coordinated <30-minute window with portal**: truncate Heroes' projection tables, portal admin reprovisions users via existing CSV/Sheet/manual flows, Heroes ops re-runs sheet ingestion for points data, Deploy C applies the gated `REVOKE`. Blocked on Spec 03b clearing first.

**Day-30 cleanup mission (in progress):**
- ✅ Drop `app_registry.introspect_secret` column, `PORTAL_INTROSPECT_SECRET` env/secret/IAM, and the legacy `x-portal-introspect-secret` accept branch — *closed by commit `96395a1` 2026-04-27.*
- Drop `signHS256BrokerToken` and `LEGACY_PORTAL_BROKER_ISSUER` once Heroes shows 100% ES256 verification for ≥7 days.
- Drop `app_registry.broker_signing_secret` column.
- Drop `services/auth-broker.ts` legacy HMAC verify branch.
- Unset `PORTAL_BROKER_SIGNING_SECRET` and `PORTAL_WEBHOOK_SIGNING_SECRET` env vars on both portal and Heroes Cloud Run configs once Heroes ships H2 send-side cleanup.
- Wire Cloud Scheduler cron at `POST /api/v1/admin/signing-keys/rotate` for routine 90-day key rotation.

## 7. Conventions & Gotchas
- Bun-native runtime — avoid heavy gRPC SDKs (`@google-cloud/tasks`, `@google-cloud/secret-manager`); use REST + `google-auth-library` instead.
- Eden client (`@elysiajs/eden`) gives the web app type-safe API calls from the workspace `@coms-portal/api` import.
- Route-group `(authed)` in `apps/web/src/routes/` is the gate for authed pages.
- Tests under `apps/api/src/__tests__/` and `apps/api/src/services/__tests__/` use Bun's test runner; e2e under `tests/e2e/` uses Playwright.
- **Bun mock-pollution gotcha:** `mock.module(...)` is process-global and survives across test files. Tests that mock a module at file scope MUST restore the real exports in `afterAll` (capture via `{ ...(await import('./module')) }` *before* mocking, then re-mock with the snapshot). Otherwise CI fails on Linux while macOS passes (different file-discovery order). The canonical pattern lives in `apps/api/src/test-helpers/schema-barrel-mock.ts` (`fullSchemaBarrelMock`, `fullDrizzleOrmMock`, `mockSpecs`) — Spec 03b adopted it across 8 test files. Three rules:
  1. **Schema barrel mocks must declare the FULL surface.** Use `fullSchemaBarrelMock()`; spread + override only the local-const sentinels your `tx.insert(table)` reference-equality branching depends on.
  2. **Service-module mocks must snapshot+restore.** `const realX = { ...(await import('~/services/X')) }` BEFORE the `mock.module` call; in `afterAll`, `mock.module('~/services/X', () => realX)`. Without this, your stubs leak into the file that tests `X`'s real implementation.
  3. **Don't `mock.module(vendor-sdk, …)` for vendor SDKs that production code instantiates at module load** (e.g. `google-auth-library`'s `OAuth2Client`). Patch the prototype method instead — module-level mocks fail when a sibling test loads the production module first. See `services/__tests__/oidc-verifier-verify-google-id-token.test.ts` for the pattern.
- **Postgres `GENERATED ALWAYS AS` for normalization** (`user_aliases.alias_normalized`) — uniqueness is enforced at the engine level, not the application layer. Never write to the generated column from application code; collisions raise `unique_violation` and surface as a typed error from the resolve-batch path.
- **`.gitignore` patterns** without a leading slash match at any depth — use `/scripts/` (anchored to root) for repo-level dev folders so subdirectories like `apps/api/scripts/` are not silently ignored.
- **Admin route auth** is currently session-cookie only (no `requireAdmin` RBAC middleware on most admin routes). Tracked as DEBT; apply `requireAdmin` from `middleware/rbac.ts` before exposing any admin routes to non-trusted users.
- **Cutover migrations** (`db/migrations/cutover/*.sql`) are not auto-applied. They run manually during coordinated cutover windows — do not move them into the standard migrations folder unless you intend `db:migrate` to apply them on the next deploy.
- **Per-app config defaults are seeded transactionally with the user.** Adding a new app manifest after users exist means running a backfill (model: mig 0026, `INSERT … ON CONFLICT DO NOTHING`) before that app's webhook subscribers depend on every user having a row.
- **Shared-package version skew is expected.** Web and API can (and currently do) sit on different `@coms-portal/shared` minors during a feature rollout. The shared package is additive across minors by convention (no breaking changes on the wire-format types shipped to consumers).
