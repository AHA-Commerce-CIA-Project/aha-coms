# Architecture Decision Record — COMS Portal

> Indexed: 2026-04-27 · 3791 nodes · 4542 edges
> Last update: Rev 2 portal-side §01–§04 deployed; introspect retired to OIDC-only (commit `96395a1`, 2026-04-27)

## 1. System Overview

**COMS Portal** is an internal admin portal that brokers identity and access across a suite of relying-party "COMS" apps (e.g. Heroes). The portal owns:

- Employee/team CRUD and provisioning
- Per-app access grants
- An auth-broker that issues short-lived signed tokens to relying-party apps (HS256 + ES256 dual-mode after Rev 2 §01)
- An OIDC-recognizable IdP surface (`/.well-known/jwks.json`, `/.well-known/openid-configuration`) for stock OIDC clients
- Webhook fanout to relying parties on user lifecycle events (HMAC + Google OIDC dual-mode after Rev 2 §03)
- A Google Sheets ↔ portal employee-info sync

Single Cloud Run service today; scope is "portal only" with a separate `coms-shared` package distributed via git tag (`v1.2.0` after Rev 2 §02).

## 2. Tech Stack & Top-Level Layout

- **Monorepo** — Bun workspaces (`apps/*`)
- **API** — `apps/api`: Elysia + Bun runtime, Drizzle ORM, Postgres (Cloud SQL), `jose` for JWTs (HS256 + ES256), `google-auth-library` for Secret Manager REST + OIDC ID tokens, Firebase/GIP for identity
- **Web** — `apps/web`: SvelteKit on `adapter-node` (SSR-on after Rev 1 §05 carryover closed 2026-04-27), Tailwind v4, TanStack Query, Eden (Elysia client), Firebase client SDK for Google sign-in
- **Shared** — `@coms-portal/shared` consumed via git+https from external repo `mrdoorba/coms-shared#v1.2.0`
- **Infra** — `infra/`: OpenTofu/Terraform — Cloud Run, Cloud SQL, Cloud Tasks, Artifact Registry, Workload Identity Federation, Secret Manager (per-app + broker signing keys), IAM (`iam-signing-keys.tf` for Cloud Run SA → `portal-broker-signing-key-*` admin)
- **Tests** — `tests/e2e/` Playwright; `apps/api/src/__tests__` and `apps/api/src/services/__tests__/` Bun test (154 tests across 22 files as of 2026-04-27)
- **Architecture specs** — `docs/architecture/rev1/spec-00..05` + `docs/architecture/rev2/spec-00..05` + Heroes handoff docs

## 3. Major Components (apps/api/src)

| Folder | Role |
|---|---|
| `routes/` | Elysia route modules: `auth`, `employees`, `teams`, `apps`, `access`, `dashboard`, `employee-info-sync`, `app-webhooks`, `admin`, **`well-known`** (Rev 2 §01-§02), **`admin/signing-keys`** (Rev 2 §01) |
| `middleware/` | `auth` (session cookie → user), `rbac`, `session-cookie` |
| `services/` | Business logic: `auth-broker` (dual-mode HS256+ES256 minting), `employees`, `employee-provisioning`, `employee-import`, `employee-info-sync`, `teams`, `apps`, `audit`, `claims`, `name-matching`, `portal-webhook-fanout`, `webhook-dispatcher` (dual-mode HMAC+OIDC), `provisioning-events`, `health-probe`, `session-revocation`, `sheets-client`, **`signing-keys`** (Rev 2 §01: keypair gen, Secret Manager REST, 5-min cache, rotation), **`oidc-verifier`** (Rev 1 §05 + Rev 2 §03 wrapper `verifyGoogleIdToken`) |
| `db/schema/` | Drizzle: `identity-users`, `teams`, `apps` (with Rev 2 §04's `service_account_email` column), `app-webhook-endpoints`, `webhook-delivery-jobs`, `auth-handoffs`, `audit`, `session-revocations`, **`signing-keys`** (Rev 2 §01: `portal_broker_signing_keys` table) |
| `scripts/` | One-shot CLIs: **`bootstrap-signing-key.ts`** (Rev 2 §01, idempotent first-key mint, CI-wired) |

API is mounted at `/api`. Routes outside the `/v1` group: `/api/health`, `/api/.well-known/jwks.json`, `/api/.well-known/openid-configuration`, and the `auth/*` broker subroutes (`/auth/broker/launch/:appSlug`, `/broker/exchange`, `/broker/introspect`, `/broker/handoff`, `/auth/session`, `/auth/logout`, `/auth/me`). The `/api/v1/*` group is auth-gated and includes `/v1/admin/signing-keys/rotate` (Rev 2 §01).

## 4. Key Architectural Decisions

### 4.1 Auth Broker — portal as IdP for sub-apps
- Portal authenticates the user via Firebase/GIP and a `__session` cookie.
- Relying-party apps redirect users to `/api/auth/broker/launch/:appSlug`; portal mints **dual-mode** broker tokens during the Rev 2 transition window:
  - **HS256** (legacy): per-app symmetric secret from `app_registry.broker_signing_secret` with env-var fallback `PORTAL_BROKER_SIGNING_SECRET`. Issuer claim: literal string `'coms-portal-broker'`.
  - **ES256** (new): asymmetric, signed with the portal's global private key (stored in Secret Manager). Issuer claim: URL-form `${PORTAL_PUBLIC_ORIGIN}/broker`. Public verification keys are served from `GET /api/.well-known/jwks.json`.
- Both tokens travel as siblings on the launch redirect URL (`portal_token` + `portal_token_es256` query params) and on the exchange response payload (`token` / `tokenHs256` / `tokenEs256`). Heroes verifies whichever it can.
- The verifier (`exchangeBrokerHandoff` in `auth-broker.ts:322`) accepts an array of issuers `[PORTAL_BROKER_ISSUER, LEGACY_PORTAL_BROKER_ISSUER]` so tokens minted with either issuer continue verifying through the dual-mode period.
- Signing key state lives in `portal_broker_signing_keys` (kid PK; status `active`/`retiring`/`retired`; partial unique index `one_active_signing_key`). Service `apps/api/src/services/signing-keys.ts` exposes `generateAndStoreNewKey`, `loadActiveSigningKey` (5-min in-process KeyLike cache), and `rotateActiveKey` (transactional active→retiring flip).
- Bootstrap of the first ES256 key runs idempotently in CI via `apps/api/scripts/bootstrap-signing-key.ts` (`.github/workflows/deploy.yml` step "Bootstrap broker signing key", env var `GCP_PROJECT_ID` from repo variable).
- Manual rotation via `POST /api/v1/admin/signing-keys/rotate` (admin-authed). Cloud Scheduler 90-day rotation cron is documented but not yet wired (follow-up infra ticket).
- OIDC discovery document at `GET /api/.well-known/openid-configuration` advertises `issuer`, `jwks_uri`, `id_token_signing_alg_values_supported: ['ES256']`, and the broker/introspect endpoints — stock OIDC clients can verify against the portal with no bespoke code.
- Rev 1 §01's per-app HS256 secrets and Rev 2 §01-§02's ES256 + JWKS + discovery are all merged and deployed (CI run `24977680477`, 2026-04-27).
- **Introspect endpoint** at `POST /api/auth/broker/introspect` is **OIDC-only** as of commit `96395a1` (2026-04-27). `authenticateIntrospectCaller` requires `Authorization: Bearer <google-id-token>` and verifies the token's `email` claim against `app_registry.service_account_email`. Auth failures emit a structured `[introspect] auth_failed app:<slug> reason:<…>` log (`app_not_found` / `sa_not_configured` / `missing_bearer` / `verify_failed`); the client always sees a generic 401 to avoid leaking app or config state. Successful calls log `[introspect] via:oidc app:<slug>`. The legacy `x-portal-introspect-secret` header, the `app_registry.introspect_secret` column (migration `0021_broad_zaran.sql`), the `PORTAL_INTROSPECT_SECRET` env var, and the corresponding Secret Manager secret + IAM grant are all removed. Heroes was the only consumer; their send-side cleanup is unblocked but not yet shipped — portal silently ignores the legacy header they currently still send.

### 4.2 Webhook Fanout — Cloud Tasks + dual-mode auth (HMAC + Google OIDC)
- `webhook-dispatcher.dispatchPortalWebhook` queries active endpoints, attempts inline POST, and on failure enqueues a Cloud Tasks retry (Rev 1 §05 retired the in-process worker).
- **Outbound auth is dual-mode (Rev 2 §03):** every webhook fetch carries both:
  - `Authorization: Bearer <google-id-token>` — token minted via `GoogleAuth.getIdTokenClient(audience)` with `audience = new URL(endpoint.url).origin`. Heroes verifies via `OAuth2Client.verifyIdToken` against Google's JWKS and asserts `email === PORTAL_SERVICE_ACCOUNT_EMAIL`.
  - Legacy HMAC headers (`X-Portal-Signature`, `X-Portal-Timestamp`, `X-Portal-Event-Id`, `X-Portal-Event`) — preserved for backwards compatibility until Heroes ships H2 and we run Day-30 cleanup.
- **Graceful degradation:** if the GCP metadata server is unreachable (local dev or transient outage), `mintWebhookAudienceToken` returns `null` and the dispatcher proceeds with HMAC-only emission rather than crashing. Logged at WARN.
- Cloud Tasks retries (3 attempts, exponential backoff) configured via Terraform; OIDC verifier at `apps/api/src/services/oidc-verifier.ts` handles the inbound side for Cloud Tasks delivery callbacks.
- Helper `verifyGoogleIdToken({idToken, expectedAudience, expectedSAEmail})` is an additive wrapper around `verifyGoogleOidcToken` — the existing Cloud Tasks delivery path's contract is preserved unchanged.

### 4.3 Health Probe — in-process interval today
- `startHealthProbeInterval()` runs as `setInterval` alongside the API.
- Cloud Scheduler migration is **deliberately deferred** at current scale (one relying-party app, daytime traffic). The failure modes Cloud Scheduler would fix — silent stop on Cloud Run scale-to-zero, duplicate probes on multi-instance — are theoretical today. Revisit when either a 2nd app onboards or staleness is observed in the admin UI during idle hours. See `docs/architecture/rev2/spec-00-implementation-timeline.md` §"Rev 1 Carryover" for the deferral rationale.

### 4.4 Web App: SSR (Rev 1 §05 closed 2026-04-27)
- `apps/web` runs on `@sveltejs/adapter-node`. `apps/web/src/routes/+layout.ts` no longer disables SSR (the historical `export const ssr = false` line was removed); SvelteKit defaults to SSR-on for the layout.
- Auth gate via the `(authed)` route group — server-side validation prevents the flash of unauthenticated content that the previous static-SPA implementation suffered from.
- Spec 05's hook-based session validation pattern shipped in Rev 1; no further migration work pending on the web side for Rev 2.

### 4.5 Drizzle Migrations — generated only
- **Project rule (CLAUDE.md):** never hand-write migrations or `meta/_journal.json` entries. Always `drizzle-kit generate` so `when` timestamps stay correct (Drizzle uses high-water-mark comparison; manually-set timestamps cause silent skips in prod).
- Data-only migrations: make a trivial schema annotation change to force `drizzle-kit generate`, then replace SQL content in the generated `.sql` file.
- Migrations run via CI (`bun run --cwd apps/api db:migrate`) with Cloud SQL Auth Proxy, immediately followed by the idempotent `bootstrap-signing-key.ts` step.
- Latest migrations: `0019_natural_roxanne_simpson.sql` (`portal_broker_signing_keys` table + partial unique index), `0020_bitter_polaris.sql` (`app_registry.service_account_email` column).

### 4.6 Shared Types Package
- `@coms-portal/shared` lives in `mrdoorba/coms-shared`, pinned by git tag in `apps/api/package.json`. Pin bumped to `v1.2.0` during Rev 2 §02 to widen `PortalBrokerHandoffResponse` with `tokenHs256` (required) + `tokenEs256` (optional, nullable) and to bump `PLATFORM_AUTH_CONTRACT_VERSION` from 1 to 2.
- The legacy `token` field stays on the response shape during dual-mode as an alias for the HS256 sibling; Day-30 cleanup will drop it along with the HS256 mint path.
- Doc comments in `src/contracts/auth.ts` describe both the legacy literal-string issuer (`'coms-portal-broker'`) and the URL-form issuer (`${ORIGIN}/broker`) so consumers understand why the verifier accepts both during transition.

## 5. External Integrations
- **GIP / Firebase Auth** — primary identity provider (Google Workspace sign-in).
- **Google Sheets API** (`@googleapis/sheets`) — bidirectional employee-info sync.
- **Cloud SQL (Postgres)** via `postgres` driver + Drizzle.
- **Cloud Run** — single deployable service.
- **Cloud Tasks** — webhook delivery retry queue (Rev 1 §05).
- **Secret Manager** — broker private signing keys (`portal-broker-signing-key-*`), per-app `broker_signing_secret` (legacy HMAC, pending Day-30 retirement), GIP API key, DB URL. Accessed via `google-auth-library`'s authenticated REST (NOT the gRPC `@google-cloud/secret-manager` SDK — Bun-unfriendly).
- **Workload Identity Federation** for CI → GCP auth (`infra/wif.tf`).
- **Relying-party apps** — Heroes today; receive ES256 broker tokens and Google-OIDC-authenticated webhooks.

## 6. Active Initiatives
**Rev 1 (complete):**
1. ~~Spec 01~~ — Per-app broker signing keys + CSRF + per-app introspect secrets *(merged, partially obsoleted by Rev 2 §01 / §04 for the broker and introspect surfaces)*
2. ~~Spec 02~~ — Provisioning bridge with `appRole` and `branch` claims *(merged)*
3. ~~Spec 03~~ — Distribute shared contracts to Heroes *(merged via the `@coms-portal/shared` package)*
4. ~~Spec 04~~ — Resilience: introspect SWR cache, health probe robustness *(merged; alerting escalation deferred to Rev 2 §05 on the Heroes side)*
5. ~~Spec 05~~ — SSR migration + Cloud Tasks *(merged; Cloud Scheduler health-probe trigger deliberately deferred at single-app scale per spec-00 §"Rev 1 Carryover" rationale)*

**Rev 2 portal-side (deployed 2026-04-27, CI run 24977680477):**
1. ~~Spec 01~~ — RS256/ES256 broker tokens + JWKS endpoint *(merged + deployed; first signing key bootstrapped via CI)*
2. ~~Spec 02~~ — OIDC discovery endpoint + URL-form issuer *(merged + deployed; live at `/.well-known/openid-configuration`)*
3. ~~Spec 03~~ — Webhook auth via Google OIDC *(merged + deployed in dual-mode; `verifyGoogleIdToken` wrapper available)*
4. ~~Spec 04~~ — Introspect auth via Google OIDC + `app_registry.service_account_email` column *(merged + deployed; admin UI surface added)*
5. **Spec 05** — Stale-serve alerting escalation — **Heroes-only**, not in this repo

**Heroes-side (unblocked, in `coms_aha_heroes`):**
- H1, H2, H3, H4 — see `docs/architecture/rev2/heroes-team-handoff.md`. H3 is gated on populating `app_registry.service_account_email` for the Heroes row before the deploy; runbook in `docs/architecture/rev2/spec-04-introspect-oidc-auth.md` §"Runbook — Heroes service account email population".

**Day-30 cleanup mission (in progress):**
- ✅ Drop `app_registry.introspect_secret` column, `PORTAL_INTROSPECT_SECRET` env/secret/IAM, and the legacy `x-portal-introspect-secret` accept branch — *closed by commit `96395a1` 2026-04-27, ahead of the 7-day soak gate at user direction.*
- Drop `signHS256BrokerToken` and `LEGACY_PORTAL_BROKER_ISSUER` once Heroes shows 100% ES256 verification for ≥7 days.
- Drop `app_registry.broker_signing_secret` column.
- Drop `apps/api/src/services/auth-broker.ts` legacy HMAC verify branch.
- Unset `PORTAL_BROKER_SIGNING_SECRET` and `PORTAL_WEBHOOK_SIGNING_SECRET` env vars on both portal and Heroes Cloud Run configs once Heroes ships H2 send-side cleanup.
- Wire Cloud Scheduler cron at `POST /api/v1/admin/signing-keys/rotate` for routine 90-day key rotation.

## 7. Conventions & Gotchas
- Bun-native runtime — avoid heavy gRPC SDKs (`@google-cloud/tasks`, `@google-cloud/secret-manager`); use REST + `google-auth-library` instead.
- Eden client (`@elysiajs/eden`) gives the web app type-safe API calls from the workspace `@coms-portal/api` import.
- Route-group `(authed)` in `apps/web/src/routes/` is the gate for authed pages.
- Tests under `apps/api/src/__tests__/` and `apps/api/src/services/__tests__/` use Bun's test runner; e2e under `tests/e2e/` uses Playwright.
- **Bun mock-pollution gotcha:** `mock.module(...)` is process-global and survives across test files. Tests that mock a module at file scope MUST restore the real exports in `afterAll` (capture via `{ ...(await import('./module')) }` *before* mocking, then re-mock with the snapshot). Otherwise CI fails on Linux while macOS passes (different file-discovery order). See `auth-broker-issuer.test.ts`, `auth-broker-dual-mode.test.ts`, `webhook-dispatcher-oidc.test.ts` for the pattern.
- **`.gitignore` patterns** without a leading slash match at any depth — use `/scripts/` (anchored to root) for repo-level dev folders so subdirectories like `apps/api/scripts/` are not silently ignored.
- **Admin route auth** is currently session-cookie only (no `requireAdmin` RBAC middleware). Tracked as DEBT; apply `requireAdmin` from `middleware/rbac.ts` before exposing any admin routes to non-trusted users.