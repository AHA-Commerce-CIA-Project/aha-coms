# Architecture Decision Record — COMS Portal

> Indexed: 2026-04-29 · 6122 nodes · 7316 edges
> Last update: Rev 3 §03c (Pre-Spec-4 Hardening) shipped 2026-04-29 across eight commits (`b03fb10`, `41a1d0d`, `93ab759`, `24f0ec6`, `8bea99f`, `2a7e608`, `249359c`, `a091968`). Eleven items: Pino structured logging, request-ID middleware, real `/api/health` probe, four new `access_audit_log` columns (`actor_ip`, `request_id`, `actor_app_id`, `target_app_id`) populated at all 28 call sites, launcher migration to `/api/userinfo`, webhook-dispatcher doc/code reconciliation, `@coms-portal/sdk` v0.1.1 published as public repo, `@coms-portal/shared` v1.4.1 with `APP_LAUNCHER` deprecation shim, OpenAPI plugin + `/api/docs`, tenant-scoped `GET /api/v1/audit-log`, integrator quickstart doc, centralised `PORTAL_ORIGIN` config + CI hardcoded-URL gate. Rev 3 §03d (Deferred Hardening Backlog) catalogues nine items consciously deferred behind cost or compliance triggers.

## 1. System Overview

**COMS Portal** is an internal admin portal that brokers identity and access across a suite of relying-party "COMS" apps (Heroes today, integrators tomorrow). The portal owns:

- Employee/team CRUD and provisioning
- Per-app access grants
- An auth-broker that issues short-lived signed tokens to relying-party apps (HS256 + ES256 dual-mode after Rev 2 §01)
- An OIDC-recognizable IdP surface (`/.well-known/jwks.json`, `/.well-known/openid-configuration`, `/api/userinfo`, RP-initiated logout) for stock OIDC clients
- Webhook fanout to relying parties on user lifecycle events (HMAC + Google OIDC dual-mode after Rev 2 §03; Rev 3 §03 added `alias.*` and `app_config.updated` events)
- A Google Sheets ↔ portal employee-info sync
- **Sole-writer semantics for `identity_users`** (Rev 3 §03) — a portal-owned alias layer brokers name-based resolution from relying-party ingestion, and a gated DB-role REVOKE prepares Heroes to lose direct write privileges at cutover
- **Per-app user config** stored centrally — manifests register per-app schemas, `app_user_config` rows are seeded inside `createEmployee`, and `app_config.updated` webhooks fan changes out
- **Public integrator surface** (Rev 3 §03c) — `@coms-portal/sdk` v0.1.1 + `/api/openapi.json` + `/api/docs` Swagger UI + `docs/architecture/integrator-quickstart.md` + tenant-scoped `GET /api/v1/audit-log`. New tenants onboard from the SDK + quickstart with zero portal source-code reading.
- **Observability foundation** (Rev 3 §03c) — Pino structured JSON logs, request-ID propagation through logs/webhooks/audit-log, real dependency-aware `/api/health`.

Single Cloud Run service today. Shared client libraries (`@coms-portal/shared`, `@coms-portal/sdk`, `@coms-portal/design-tokens`, `@coms-portal/ui`, `@coms-portal/account-widget`) live in standalone GitHub repos and are consumed via `git+https://…#vX.Y.Z`.

## 2. Tech Stack & Top-Level Layout

- **Monorepo** — Bun workspaces (`apps/*`)
- **API** — `apps/api`: Elysia + Bun runtime, Drizzle ORM, Postgres (Cloud SQL), `jose` for JWTs (HS256 + ES256), `google-auth-library` for Secret Manager REST + OIDC ID tokens, Firebase/GIP for identity, **`pino`** for structured logging, **`@elysiajs/swagger`** for OpenAPI 3.x generation
- **Web** — `apps/web`: SvelteKit on `adapter-node` (SSR-on after Rev 1 §05 carryover closed 2026-04-27), Tailwind v4, TanStack Query, Eden (Elysia client), Firebase client SDK for Google sign-in, `pino` mirror for server-side logging. Consumes `@coms-portal/account-widget` v0.1.0, `@coms-portal/design-tokens` v1.1.0, `@coms-portal/ui` v1.2.0, and `@coms-portal/shared` v1.4.1 (now matched to API)
- **Shared (auth contracts)** — `@coms-portal/shared` (`mrdoorba/coms-shared#v1.4.1` — v1.4.1 added the `APP_LAUNCHER` deprecation shim with `console.warn` on first access; removal targets v1.5.0)
- **Shared (SDK)** — `@coms-portal/sdk` (`mrdoorba/coms-sdk#v0.1.1` — public repo) — framework-neutral integrator SDK exporting `verifyBrokerToken`, `verifyWebhookSignature`, `resolveAlias`, `introspectSession`, `getAuditLog`. Module-level JWKS cache (F-3 patch in v0.1.1).
- **Shared (UX)** — `@coms-portal/account-widget` (`mrdoorba/coms-account-widget#v0.1.0`), `@coms-portal/design-tokens` (`mrdoorba/coms-design-tokens#v1.1.0`), `@coms-portal/ui` chrome + primitives (`mrdoorba/coms-ui#v1.2.0`)
- **Infra** — `infra/`: OpenTofu/Terraform — Cloud Run, Cloud SQL, Cloud Tasks, Artifact Registry, Workload Identity Federation, Secret Manager (per-app + broker signing keys), IAM (`iam-signing-keys.tf` for Cloud Run SA → `portal-broker-signing-key-*` admin)
- **Tests** — `tests/e2e/` Playwright; `apps/api/src/__tests__/`, `apps/api/src/middleware/__tests__/`, `apps/api/src/routes/__tests__/`, and `apps/api/src/services/__tests__/` Bun test. Shared mock helpers at `apps/api/src/test-helpers/schema-barrel-mock.ts`. Per-process isolation: `bun test` invoked one file at a time via `find … | xargs -P4 -n1 bun test {}` to defeat Bun's process-global `mock.module` registry.
- **Architecture specs** — `docs/architecture/integrator-quickstart.md` (canonical integrator path) + `docs/architecture/rev1/spec-00..05` + `rev2/spec-00..05` + `rev3/spec-00..05` + `spec-03b-test-gate-cleanup.md` + `spec-03c-pre-spec-4-hardening.md` + `spec-03d-deferred-hardening-backlog.md` + Heroes handoff docs

## 3. Major Components (apps/api/src)

| Folder | Role |
|---|---|
| `config.ts` | **Rev 3 §03c** — single source of truth for `PORTAL_ORIGIN` (env `PORTAL_PUBLIC_ORIGIN`, defaults `https://coms.ahacommerce.net`), `WEB_ORIGIN`, `CORS_ALLOWED_ORIGINS` (comma-separated env list), `SESSION_COOKIE_DOMAIN`. Every URL-building call site reads from this module. CI hardcoded-URL gate fails the build if `run.app`, `coms-portal-`, or `ahacommerce.net` literals appear anywhere outside this file, `.env.example`, deploy YAML, or `docs/`. |
| `logger.ts` | **Rev 3 §03c** — Pino root logger. Dev mode uses `pino-pretty`; prod emits structured JSON with `severity` field (Cloud Logging auto-parses). Imported as `~/logger` across services + routes. |
| `middleware/request-id.ts` | **Rev 3 §03c** — Elysia plugin that derives `requestId` (UUID-validated incoming `x-coms-request-id` header or new `crypto.randomUUID()`), `actorIp` (from `x-forwarded-for` first hop or `x-real-ip`), and a child `log` logger bound with `requestId`. Sets `x-coms-request-id` on every response. Plugin name `'request-id'`, scope `global`. |
| `routes/` | Elysia route modules: `auth`, `employees`, `teams`, `apps`, `access`, `dashboard`, `employee-info-sync`, `app-webhooks`, `admin`, `well-known` (Rev 2 §01-§02), `userinfo` (Rev 3 §01), `internal`, `aliases` (Rev 3 §03), `users` (Rev 3 §03), `admin/signing-keys` (Rev 2 §01), `admin/alias-queue`, `admin/app-config` (Rev 3 §03), **`audit-log`** (Rev 3 §03c — `GET /api/v1/audit-log`, broker-token-authenticated, tenant-scoped via `actor_app_id` OR `target_app_id` matching the broker token's appId claim; cursor-paginated; max 30-day window; `actor_ip` deliberately stripped from the response, `request_id` exposed for caller correlation) |
| `middleware/` | `auth` (session cookie → user), `rbac`, `session-cookie`, `app-token` (Rev 3 §03 — `requireAppToken()` verifying inbound Google OIDC tokens against `app_registry.service_account_email`), **`broker-token`** (Rev 3 §03c — `requireBrokerToken()` verifying inbound ES256 broker tokens against the `portal_broker_signing_keys` JWKS, accepts both `PORTAL_BROKER_ISSUER` and the legacy literal-string issuer, returns `{ app: { id, slug } }` for tenant scoping) |
| `services/` | Business logic: `auth-broker` (dual-mode HS256+ES256 minting), `employees`, `employee-provisioning` (Rev 3 §03 seeds `app_user_config` defaults + includes `appConfig` slice in `user.provisioned`), `employee-import`, `employee-info-sync`, `teams`, `apps`, `audit`, `claims`, `name-matching`, `portal-webhook-fanout`, `webhook-dispatcher` (dual-mode HMAC+OIDC; **request-ID propagation in outbound `X-Coms-Request-Id` header** added Rev 3 §03c), `provisioning-events`, `health-probe` (probes registered apps — separate concern from `/api/health`), `session-revocation`, `sheets-client`, `signing-keys` (Rev 2 §01), `oidc-verifier`, `aliases`, `alias-events`, `app-user-config`, `app-user-config-events`, `manifests`, `cloud-tasks-client`, **`health.ts`** (Rev 3 §03c — `probeHealth()` runs db `SELECT 1` + Secret Manager `GET secret/version/latest:access` + Cloud Tasks `GET queue` in parallel with 500ms per-check timeout; returns `{ status: 'ok'\|'degraded', checks: { db, secretManager, cloudTasks } }`; mounted at `GET /api/health` returning HTTP 200/503 by overall status) |
| `db/schema/` | Drizzle: `identity-users`, `teams`, `apps`, `app-webhook-endpoints`, `webhook-delivery-jobs`, `auth-handoffs`, `audit` (Rev 3 §03c — added `actor_ip` varchar(45), `request_id` uuid, `actor_app_id` uuid FK, `target_app_id` uuid FK, plus indexes `idx_access_audit_log_actor_app_created_at` and `idx_access_audit_log_target_app_created_at`), `session-revocations`, `signing-keys` (Rev 2 §01), `user-aliases`, `alias-collision-queue`, `app-manifests`, `app-user-config`, `bulk-edit-locks` |
| `scripts/` | One-shot CLIs: `bootstrap-signing-key.ts` (Rev 2 §01, idempotent first-key mint, CI-wired) |
| `db/migrations/cutover/` | Manually-applied migrations gated outside the auto-migrate flow. Rev 3 §03 added `0001_revoke_heroes_writes.sql`. NOT applied by `db:migrate`; runs only at the coordinated Heroes cutover window |

API is mounted at `/api`. Routes outside the `/v1` group: `/api/health` (Rev 3 §03c real probe), `/api/openapi.json` + `/api/docs` (Rev 3 §03c — Swagger UI, no auth, public integrator contract), `/api/.well-known/jwks.json`, `/api/.well-known/openid-configuration`, `/api/userinfo`, the `auth/*` broker subroutes, `/api/internal/*`, `/api/aliases/resolve-batch`, `/api/users/:portalSub/config/:appId`. The `/api/v1/*` group splits into:
- **Session-cookie-authed** (the bulk): employee/team/app/access/dashboard/sync/webhook routes plus `/v1/admin/signing-keys/rotate`, `/v1/admin/alias-queue/*`, `/v1/admin/app-config/*`.
- **Broker-token-authed** (Rev 3 §03c): `/v1/audit-log` for tenant self-service audit reads.

## 4. Key Architectural Decisions

### 4.1 Auth Broker — portal as IdP for sub-apps
- Portal authenticates the user via Firebase/GIP and a `__session` cookie.
- Relying-party apps redirect users to `/api/auth/broker/launch/:appSlug`; portal mints **dual-mode** broker tokens during the Rev 2 transition window:
  - **HS256** (legacy): per-app symmetric secret from `app_registry.broker_signing_secret` with env-var fallback `PORTAL_BROKER_SIGNING_SECRET`. Issuer claim: literal string `'coms-portal-broker'`.
  - **ES256** (new): asymmetric, signed with the portal's global private key (stored in Secret Manager). Issuer claim: URL-form `${PORTAL_ORIGIN}/broker` (read from `apps/api/src/config.ts` — Rev 3 §03c made this config-driven). Public verification keys are served from `GET /api/.well-known/jwks.json`.
- Both tokens travel as siblings on the launch redirect URL (`portal_token` + `portal_token_es256` query params) and on the exchange response payload (`token` / `tokenHs256` / `tokenEs256`). Heroes verifies whichever it can.
- The verifier (`exchangeBrokerHandoff` in `auth-broker.ts`) accepts an array of issuers `[PORTAL_BROKER_ISSUER, LEGACY_PORTAL_BROKER_ISSUER]` so tokens minted with either issuer continue verifying through the dual-mode period.
- Signing key state lives in `portal_broker_signing_keys` (kid PK; status `active`/`retiring`/`retired`; partial unique index `one_active_signing_key`). Service `services/signing-keys.ts` exposes `generateAndStoreNewKey`, `loadActiveSigningKey` (5-min in-process KeyLike cache), and `rotateActiveKey`.
- Bootstrap of the first ES256 key runs idempotently in CI via `apps/api/scripts/bootstrap-signing-key.ts`.
- Manual rotation via `POST /api/v1/admin/signing-keys/rotate` (admin-authed). Cloud Scheduler 90-day rotation cron documented but not yet wired (Spec 03d D9).
- OIDC discovery document at `GET /api/.well-known/openid-configuration` advertises `issuer`, `jwks_uri`, `id_token_signing_alg_values_supported: ['ES256']`, the broker/introspect endpoints, the `userinfo_endpoint` (`/api/userinfo`), and the `end_session_endpoint` (`/api/auth/logout`).
- **Introspect endpoint** at `POST /api/auth/broker/introspect` is **OIDC-only** as of commit `96395a1` (2026-04-27). `authenticateIntrospectCaller` requires `Authorization: Bearer <google-id-token>` and verifies the token's `email` claim against `app_registry.service_account_email`.

### 4.2 Webhook Fanout — Cloud Tasks + dual-mode auth (HMAC + Google OIDC)
- `webhook-dispatcher.dispatchPortalWebhook` queries active endpoints, attempts inline POST, and on failure enqueues a Cloud Tasks retry (Rev 1 §05 retired the in-process worker).
- **Outbound auth is dual-mode (Rev 2 §03):** every webhook fetch carries both:
  - `Authorization: Bearer <google-id-token>` minted via `GoogleAuth.getIdTokenClient(audience)` with `audience = new URL(endpoint.url).origin`.
  - Legacy HMAC headers (`X-Portal-Signature`, `X-Portal-Timestamp`, `X-Portal-Event-Id`, `X-Portal-Event`).
- **Request-ID propagation (Rev 3 §03c):** every outbound webhook also carries `X-Coms-Request-Id: <uuid>` matching the inbound request that triggered the dispatch. Recipients can correlate their logs back to the portal log line.
- **Graceful degradation:** if the GCP metadata server is unreachable, `mintWebhookAudienceToken` returns `null` and the dispatcher proceeds with HMAC-only emission rather than crashing. Logged at WARN.
- **Dead-letter signal (Rev 3 §03c reconciled):** there is **no separate `/api/internal/webhook-dlq` route** (the docstring at `webhook-dispatcher.ts:12` previously implied one). When Cloud Tasks exhausts max attempts, the final-attempt branch in `/api/internal/webhook-delivery` (`internal.ts:144–182`) sets the endpoint to `disabled`. The disabled state IS the dead-letter signal. Replay UI / dashboard deferred to Spec 03d.
- **Rev 3 §03 events:** `alias.resolved`, `alias.updated`, `alias.deleted`, and `app_config.updated` (per-app slice filtering). `user.provisioned` payload extended additively with optional per-recipient `appConfig` slice. Wire-format types ship in `@coms-portal/shared` v1.4.1.

### 4.3 Health Probe — split between portal-self and registered-apps
- **`/api/health` (Rev 3 §03c)** runs `probeHealth()` from `services/health.ts`: parallel `SELECT 1` (db), Secret Manager version-access (verifies WIF + reachability), Cloud Tasks queue metadata (verifies queue accessibility). Each check has a 500ms timeout. Returns 200 with `status: 'ok'` only when all three pass; 503 with `status: 'degraded'` otherwise. The response body always names the failing checks.
- **`startHealthProbeInterval()` (`services/health-probe.ts`)** still runs as `setInterval` alongside the API to probe *registered relying-party apps*. Cloud Scheduler migration for that probe is **deliberately deferred** at current scale — see `docs/architecture/rev2/spec-00-implementation-timeline.md` §"Rev 1 Carryover".

### 4.4 Web App: SSR (Rev 1 §05 closed 2026-04-27)
- `apps/web` runs on `@sveltejs/adapter-node`. SvelteKit defaults to SSR-on for the layout.
- Auth gate via the `(authed)` route group.
- **Launcher is data-driven (Rev 3 §03c).** `apps/web/src/routes/(authed)/+layout.svelte` reads from `/api/userinfo` (server-side fetch in `+layout.server.ts`), not the static `APP_LAUNCHER` constant. Adding a row to `app_registry` makes the app appear in the chrome launcher and account widget without a portal redeploy and without bumping `@coms-portal/shared`. The `APP_LAUNCHER` export remains in `@coms-portal/shared` v1.4.1 with a `console.warn` deprecation shim; removal lands in v1.5.0.
- Rev 3 §01 (account widget) and Rev 3 §02 (design tokens + UI chrome) shipped portal-side dogfooding the standalone `@coms-portal/*` packages.

### 4.5 Drizzle Migrations — generated only
- **Project rule (CLAUDE.md):** never hand-write migrations or `meta/_journal.json` entries. Always `drizzle-kit generate`.
- Data-only migrations: trivial schema annotation change to force generation, then replace SQL content. Drop the marker in a follow-up with `IF EXISTS`.
- Migrations run via CI with Cloud SQL Auth Proxy, immediately followed by `bootstrap-signing-key.ts`.
- **Cutover migrations** (`db/migrations/cutover/*.sql`) are NOT auto-applied.
- Latest migrations:
  - `0019_natural_roxanne_simpson.sql` — `portal_broker_signing_keys` (Rev 2 §01)
  - `0020_bitter_polaris.sql` — `app_registry.service_account_email` (Rev 2 §04)
  - `0021_broad_zaran.sql` — drop `app_registry.introspect_secret` (Day-30 cleanup)
  - `0022_dazzling_black_panther.sql` — `user_aliases` + `alias_collision_queue` (Rev 3 §03)
  - `0023_purple_red_skull.sql` — `app_manifests` + `app_user_config` + `bulk_edit_locks` (Rev 3 §03)
  - `0024_lyrical_charles_xavier.sql` — alias backfill (Rev 3 §03)
  - `0025_rare_deadpool.sql` — drop `_backfill_marker` (idempotent)
  - `0026_robust_apocalypse.sql` — `app_user_config` defaults backfill (Rev 3 §03)
  - `0027_fuzzy_giant_man.sql` — schema-snapshot no-op cleanup
  - `0028_little_deadpool.sql` — **Rev 3 §03c** — `access_audit_log` adds `actor_ip` varchar(45), `request_id` uuid, `actor_app_id` uuid FK→`app_registry`, `target_app_id` uuid FK→`app_registry`, plus actor-app and target-app + created-at indexes for tenant-scoped audit reads

### 4.6 Shared Packages
- **`@coms-portal/shared`** v1.4.1 (`mrdoorba/coms-shared`). Both API and web on v1.4.1 (Rev 3 §03c reconciled the version skew). v1.4.1 added the `APP_LAUNCHER` deprecation shim. v1.5.0 will remove it.
- **`@coms-portal/sdk`** v0.1.1 (`mrdoorba/coms-sdk`, **public** repo) — Rev 3 §03c. Framework-neutral integrator SDK. Five exports: `verifyBrokerToken` (ES256 via JWKS, HS256 via per-app secret, throws typed `BrokerTokenError`), `verifyWebhookSignature` (HMAC-SHA256 constant-time), `resolveAlias`, `introspectSession`, `getAuditLog`. Module-level JWKS cache (F-3 patch hoisted from request-scope to module-scope in v0.1.1). Distributed via `git+https://github.com/mrdoorba/coms-sdk.git#vX.Y.Z`. Carries `CHANGELOG.md` (Keep-a-Changelog) + `SUPPORTED_VERSIONS.md` for stated semver + deprecation policy.
- **`@coms-portal/account-widget`** v0.1.0 (`mrdoorba/coms-account-widget`) — Rev 3 §01.
- **`@coms-portal/design-tokens`** v1.1.0 (`mrdoorba/coms-design-tokens`) — Rev 3 §02 Phase 2.
- **`@coms-portal/ui`** v1.2.0 (`mrdoorba/coms-ui`) — Rev 3 §02 Phase 3 + Phase 4. v1.0.0 shipped chrome (ServiceBar, Sidebar, MobileTopBar, MobileBottomNav). v1.1.0 added `./styles.css` export for Tailwind v4 source-registration. v1.2.0 (2026-04-29) shipped 15 shadcn-svelte v3 primitive families (button, badge, card, label, input, textarea, separator, skeleton, table, avatar, tabs, dialog, dropdown-menu, select, sheet) + `cn()` helper at `src/utils.ts`. Direct deps: bits-ui ^2.16.3, clsx ^2.1.1, lucide-svelte ^0.460.0, tailwind-merge ^3.5.0, tailwind-variants ^3.2.2. Compositions stub remains. Adopted by portal `apps/web` 2026-04-29 (commit `ce53bf5` + `8b2d476` employees-list follow-up) and Heroes 2026-04-30 (commit `b7b7431` — local `ui/` deleted, 24 files rewired to `@coms-portal/ui/primitives`). Round-trip complete; no parallel implementation in either consumer.

### 4.7 User Identity Ownership & Alias Layer (Rev 3 §03)
- **Portal is the sole writer of `identity_users`.** DB-role REVOKE staged at `db/migrations/cutover/0001_revoke_heroes_writes.sql`, applies only at the coordinated Heroes cutover window.
- **Alias resolution.** `user_aliases.alias_normalized` is `GENERATED ALWAYS AS (lower(regexp_replace(trim("alias"), '\s+', ' ', 'g'))) STORED` and uniquely indexed — collisions caught at write time by the engine. Partial unique index enforces one `is_primary` alias per user.
- **Two-step rename.** Transactional `INSERT` of new alias + `UPDATE` of `is_primary`, then `DELETE` of old row gated on consumer ack.
- **Collision detection.** Levenshtein distance + token-set ratio against existing `alias_normalized`; near-misses go to `alias_collision_queue` for human triage at `/admin/aliases`.
- **Resolve-batch endpoint.** `POST /api/aliases/resolve-batch` (gated by `requireAppToken`). **In-memory token-bucket rate limit** (20 RPS / burst 40) per-app — Cloud-Run-instance-local; Spec 03d D1 promotes to Redis-backed when multi-instance is observed.
- **Per-app config.** `app_manifests` registers JSON-Schema `config_schema` per app at boot via `services/manifests.ts` (Heroes seed at `services/manifests/heroes.json`). `app_user_config` carries one row per `(portal_sub, app_id)`; defaults seeded inside the `createEmployee` transaction. Backfill for existing users in mig 0026.
- **`app_config.updated` webhook.** Per-app slice filtering — only the affected app's subscribers receive the slice.
- **Admin UIs.** `/admin/aliases` (collision queue triage) and `/admin/app-config` (single edit + selection-bulk + CSV-bulk preview-then-commit, with `bulk_edit_locks` enforcing single-active-bulk-per-app).

### 4.8 Public Integrator Surface (Rev 3 §03c)
- **`@coms-portal/sdk` is the canonical integration entry point.** New tenants depend on it via git URL; they do not read portal source.
- **`/api/openapi.json` + `/api/docs`** serve a derived OpenAPI 3.x document covering every public route, tagged by group. `internal/*` routes are tagged `x-internal: true`. Both endpoints are public (no auth).
- **`docs/architecture/integrator-quickstart.md`** is the canonical integrator path: register an app → exchange a broker token → verify a webhook → resolve aliases → read your tenant's audit log. The Heroes handoff doc (`heroes-integration-handoff.md`) is now a Heroes-specific supplement, not the entry point.
- **Tenant-scoped audit-log read** at `GET /api/v1/audit-log` (broker-token-authed via `requireBrokerToken`). Predicate: `actor_app_id = caller.appId OR target_app_id = caller.appId`. Cursor-paginated (opaque base64url over `{createdAt, id}`), 30-day max range, default 50 / max 100 entries. **`actor_ip` is stripped** from the response (PII / debugging-only). `request_id` IS exposed so integrators can correlate to logs they captured from the `X-Coms-Request-Id` response header.
- **Domain-readiness.** `apps/api/src/config.ts` centralises `PORTAL_ORIGIN`, `WEB_ORIGIN`, `CORS_ALLOWED_ORIGINS`, `SESSION_COOKIE_DOMAIN`. Default `PORTAL_ORIGIN` is `https://coms.ahacommerce.net`. Flipping the actual DNS + Cloud Run domain mapping is a config-only change — no code edits, no SDK rebuild. CI hardcoded-URL gate prevents regressions: build fails if `run.app`, `coms-portal-`, or `ahacommerce.net` literals appear outside `config.ts`, `.env.example`, deploy YAML, or `docs/`.

### 4.9 Observability (Rev 3 §03c)
- **Pino structured logging** across `apps/api` + `apps/web`. Dev: `pino-pretty`. Prod: structured JSON with `severity` (Cloud Logging auto-ingests). Migrated all 32 `console.log/error` sites; canonical pattern is `log.info({ requestId, ... }, 'message')` via the request-scoped child logger.
- **Request-ID middleware** (`middleware/request-id.ts`) generates a UUID per request (or accepts a UUID-validated incoming `x-coms-request-id` for caller-driven correlation), exposes it on the Elysia context as `requestId`, attaches the child logger as `log`, sets the `x-coms-request-id` response header, propagates it to outbound webhooks, and writes it to every `access_audit_log` row touched during the request.
- **Audit-log column population.** All 28 `writeAccessAuditLog` (or equivalent insert) call sites now populate `actor_ip`, `request_id`, and (where applicable) `actor_app_id` / `target_app_id`. Existing rows stay null; new rows always populated.
- **Real `/api/health`** as described in §4.3.

## 5. External Integrations
- **GIP / Firebase Auth** — primary identity provider.
- **Google Sheets API** — bidirectional employee-info sync.
- **Cloud SQL (Postgres)** via `postgres` driver + Drizzle.
- **Cloud Run** — single deployable service.
- **Cloud Tasks** — webhook delivery retry queue.
- **Secret Manager** — broker private signing keys, per-app `broker_signing_secret` (legacy HMAC), GIP API key, DB URL. Accessed via `google-auth-library` REST.
- **Cloud Logging** — auto-ingests structured JSON from Cloud Run stdout (Rev 3 §03c — no GCP-side config change needed).
- **Workload Identity Federation** for CI → GCP auth.
- **Relying-party apps + future integrators** — Heroes today; receive ES256 broker tokens, Google-OIDC-authenticated webhooks, `alias.*` and `app_config.updated` events. Inbound calls authenticate via Google OIDC service-account ID tokens (`requireAppToken`) or ES256 broker tokens (`requireBrokerToken`, used by `/v1/audit-log`).

## 6. Active Initiatives

**Rev 1 (complete):** Specs 01–05 merged. Spec 05 Cloud-Scheduler-on-health-probe deliberately deferred at single-app scale.

**Rev 2 portal-side (complete):** Specs 01–04 merged + deployed 2026-04-27. Spec 05 (stale-serve alerting escalation) is Heroes-only.

**Rev 3 portal-side (complete):**
1. ✅ Spec 01 — Shared Account Widget — `@coms-portal/account-widget` v0.1.0.
2. ✅ Spec 02 — Design System Phases 1+2+3+4 — `@coms-portal/design-tokens` v1.1.0 + `@coms-portal/ui` v1.2.0. Phase 4 shipped end-to-end: portal-side 2026-04-29 (15 primitive families lifted from Heroes); Heroes-side 2026-04-30 (local `ui/` deleted, 24 files rewired). Round-trip complete — `@coms-portal/ui v1.2.0` is the single source of truth for primitives across both consumers. Phase 5 (onboarding exercise) deferred until third H-app onboards.
3. ✅ Spec 03 — User Identity Ownership & Alias Layer (12 effects).
4. ✅ Spec 03b — Test-gate cleanup — mock-isolation pattern at `apps/api/src/test-helpers/schema-barrel-mock.ts` adopted across 8 test files; per-process test isolation via `find … | xargs -P4 -n1 bun test {}`.
5. ✅ **Spec 03c — Pre-Spec-4 Hardening (shipped 2026-04-29).** Eleven items: launcher migration to `/api/userinfo` + `APP_LAUNCHER` deprecation shim; Pino structured logging across `apps/api` + `apps/web`; request-ID middleware with UUID validation + propagation to logs/webhooks/audit-log; four `access_audit_log` columns (`actor_ip`, `request_id`, `actor_app_id`, `target_app_id`) populated at all 28 call sites; real `/api/health` probe (db + Secret Manager + Cloud Tasks); webhook-dispatcher doc/code reconciliation (no `/api/internal/webhook-dlq` route exists); `@coms-portal/sdk` extraction to public repo `mrdoorba/coms-sdk` v0.1.1 with five exports + module-level JWKS cache; integrator quickstart at `docs/architecture/integrator-quickstart.md`; centralised `PORTAL_ORIGIN`/`WEB_ORIGIN`/`CORS_ALLOWED_ORIGINS`/`SESSION_COOKIE_DOMAIN` config + CI hardcoded-URL gate; SDK semver + deprecation policy (CHANGELOG + SUPPORTED_VERSIONS); OpenAPI plugin + `/api/openapi.json` + `/api/docs`; tenant-scoped `GET /api/v1/audit-log` with cursor pagination, 30-day window, `actor_ip` stripped, `request_id` exposed.
6. ✅ Spec 03d — Deferred Hardening Backlog (decided + deferred). Nine items catalogued with explicit triggers. Cost-bearing: D1 Redis-backed rate limiter (~$35/mo, trigger: multi-instance Cloud Run), D2 staging environment (~$15–50/mo, trigger: breaking-change validation need or external tenant). Free items: D3 per-tenant signing key derivation, D4 webhook secret KMS encryption, D5 `compliance_status` token-issuance enforcement, D6 session-expiry UX, D7 broker-token refresh flow, D8 rate-limit extension to other routes, D9 audit-log Cloud Logging sink + retention + signing-key rotation cron + DLQ replay UI. Each item has a specific trigger; none are scheduled.
7. Spec 04 — Unified user preferences (theme + locale via `coms_prefs` ID-token claim) — *deferred* until 3rd H-app onboards / drift report / Spec 02 Phase 2+ ships.
8. Spec 05 — Suite search / command palette — *deferred (optional)* until N>6 apps or first cross-app search request.

**Heroes-side (in `coms_aha_heroes`):**
- Rev 2 — H1, H2, H3, H4 — see `docs/architecture/rev2/heroes-team-handoff.md`.
- Rev 3 §01 — Adopt `@coms-portal/account-widget` per `docs/architecture/rev3/heroes-integration-handoff.md`.
- Rev 3 §03 — Phase 0 prep + Phase 1 ingestion rewrite per `spec-03 §Appendix A`. Cutover (Phase 3) is a coordinated <30-min window. Heroes can additionally adopt `@coms-portal/sdk` v0.1.1 to replace bespoke broker/webhook verification code (follow-up, independent of cutover).

**Day-30 cleanup mission (in progress):**
- ✅ Drop `app_registry.introspect_secret`, `PORTAL_INTROSPECT_SECRET`, legacy header — *closed by `96395a1`.*
- Drop `signHS256BrokerToken` and `LEGACY_PORTAL_BROKER_ISSUER` once Heroes shows 100% ES256 verification ≥7 days.
- Drop `app_registry.broker_signing_secret` column.
- Drop `services/auth-broker.ts` legacy HMAC verify branch.
- Unset `PORTAL_BROKER_SIGNING_SECRET` and `PORTAL_WEBHOOK_SIGNING_SECRET` env vars on portal + Heroes Cloud Run configs after Heroes ships H2.
- Remove `APP_LAUNCHER` from `@coms-portal/shared` v1.5.0 once consumers (currently only the portal web app, which already migrated in §03c) are confirmed off it.
- Wire Cloud Scheduler cron at `POST /api/v1/admin/signing-keys/rotate` (Spec 03d D9).

## 7. Conventions & Gotchas
- Bun-native runtime — avoid heavy gRPC SDKs (`@google-cloud/tasks`, `@google-cloud/secret-manager`); use REST + `google-auth-library`.
- Eden client gives the web app type-safe API calls.
- Route-group `(authed)` in `apps/web/src/routes/` is the gate for authed pages.
- **Bun mock-pollution gotcha:** `mock.module(...)` is process-global and survives across test files. Tests that mock a module at file scope MUST restore the real exports in `afterAll` (capture via `{ ...(await import('./module')) }` *before* mocking, then re-mock with the snapshot). Otherwise CI fails on Linux while macOS passes (different file-discovery order). The canonical pattern lives in `apps/api/src/test-helpers/schema-barrel-mock.ts` (`fullSchemaBarrelMock`, `fullDrizzleOrmMock`, `mockSpecs`). Three rules:
  1. **Schema barrel mocks must declare the FULL surface.** Use `fullSchemaBarrelMock()`; spread + override only the local-const sentinels your `tx.insert(table)` reference-equality branching depends on.
  2. **Service-module mocks must snapshot+restore.** `const realX = { ...(await import('~/services/X')) }` BEFORE the `mock.module` call; in `afterAll`, `mock.module('~/services/X', () => realX)`.
  3. **Don't `mock.module(vendor-sdk, …)` for vendor SDKs that production code instantiates at module load** (e.g. `google-auth-library`'s `OAuth2Client`). Patch the prototype method instead. See `services/__tests__/oidc-verifier-verify-google-id-token.test.ts`.
- **Per-process test isolation.** The `apps/api` test script runs `find src -name '*.test.ts' | sort | xargs -I{} -n1 -P 4 bun test {}` — one Bun process per test file, sorted to keep file order stable across OSes. Don't replace this with `bun test` (which would batch all files into one process and re-introduce mock pollution).
- **Postgres `GENERATED ALWAYS AS` for normalization** (`user_aliases.alias_normalized`) — uniqueness enforced at the engine level. Never write to the generated column from application code; collisions raise `unique_violation`.
- **`.gitignore` patterns** without a leading slash match at any depth — use `/scripts/` (anchored to root) for repo-level dev folders.
- **Admin route auth** is currently session-cookie only on most admin routes (no `requireAdmin` RBAC). Tracked as DEBT.
- **Cutover migrations** (`db/migrations/cutover/*.sql`) are not auto-applied. Don't move them into the standard migrations folder unless you intend `db:migrate` to apply them on the next deploy.
- **Per-app config defaults are seeded transactionally with the user.** Adding a new app manifest after users exist requires a backfill (model: mig 0026, `INSERT … ON CONFLICT DO NOTHING`) before that app's webhook subscribers depend on every user having a row.
- **Rev 3 §03c hardcoded-URL CI gate.** Don't write portal URLs as string literals anywhere outside `apps/api/src/config.ts`, `.env.example`, `.github/workflows/*.yml`, or `docs/**`. The CI grep gate fails the build on `run.app`, `coms-portal-`, or `ahacommerce.net` literals elsewhere. Always import from `~/config`.
- **Rev 3 §03c request-ID propagation.** When dispatching outbound HTTP from inside a request handler, take `requestId` from the Elysia context (or fall back to `crypto.randomUUID()` for cron / startup paths) and attach it as `X-Coms-Request-Id`. The webhook dispatcher already does this; new outbound paths must follow the pattern.
- **Rev 3 §03c audit-log call sites.** When adding a new `access_audit_log` insert, populate `actor_ip` + `request_id` from the request context and `actor_app_id` / `target_app_id` from the broker-token / app-token context where the action involves a relying-party app. Type-checker enforces non-defaulted columns.
- **`actor_ip` is internal-only.** Never expose it on a public response (`/v1/audit-log` deliberately strips it). It's PII / debugging-only.
- **SDK is the integrator entry point, not the source of truth.** The portal's `auth-broker.ts` and `webhook-dispatcher.ts` remain authoritative for signing; the SDK ports verification logic to keep them mechanically aligned. If a contract change is required, change the portal first, then the SDK, then bump the SDK minor — never the other way around.
- **Shared-package version skew was reconciled in Rev 3 §03c.** Both API and web are on `@coms-portal/shared` v1.4.1. Future minor bumps should keep parity unless a feature is one-side-only.
