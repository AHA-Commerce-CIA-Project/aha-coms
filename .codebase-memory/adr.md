# Architecture Decision Record — COMS Portal

> Indexed: 2026-04-26 · 3163 nodes · 3846 edges

## 1. System Overview

**COMS Portal** is an internal admin portal that brokers identity and access across a suite of relying-party "COMS" apps (e.g. Heroes). The portal owns:

- Employee/team CRUD and provisioning
- Per-app access grants
- An auth-broker that issues short-lived signed tokens to relying-party apps
- Webhook fanout to relying parties on user lifecycle events
- A Google Sheets ↔ portal employee-info sync

Single Cloud Run service today; scope is "portal only" with a separate `coms-shared` package distributed via git tag (`v1.1.0`).

## 2. Tech Stack & Top-Level Layout

- **Monorepo** — Bun workspaces (`apps/*`)
- **API** — `apps/api`: Elysia + Bun runtime, Drizzle ORM, Postgres (Cloud SQL), Jose for JWTs, Firebase/GIP for identity
- **Web** — `apps/web`: SvelteKit (currently `adapter-static` SPA), Tailwind v4, TanStack Query, Eden (Elysia client), Firebase client SDK for Google sign-in
- **Shared** — `@coms-portal/shared` consumed via git+https from external repo `mrdoorba/coms-shared#v1.1.0`
- **Infra** — `infra/`: OpenTofu/Terraform — Cloud Run, Cloud SQL, Artifact Registry, Workload Identity Federation, secrets
- **Tests** — `tests/e2e/` Playwright; `apps/api/src/__tests__` Bun test
- **Architecture specs** — `docs/architecture/rev1/spec-00..05` + Heroes handoff doc

## 3. Major Components (apps/api/src)

| Folder | Role |
|---|---|
| `routes/` | Elysia route modules: `auth`, `employees`, `teams`, `apps`, `access`, `dashboard`, `employee-info-sync`, `app-webhooks`, `admin` |
| `middleware/` | `auth` (session cookie → user), `rbac`, `session-cookie` |
| `services/` | Business logic: `auth-broker`, `employees`, `employee-provisioning`, `employee-import`, `employee-info-sync`, `teams`, `apps`, `audit`, `claims`, `name-matching`, `portal-webhook-fanout`, `webhook-dispatcher`, `webhook-delivery-worker`, `provisioning-events`, `health-probe`, `session-revocation`, `sheets-client` |
| `db/schema/` | Drizzle: `identity-users`, `teams`, `apps`, `app-webhook-endpoints`, `webhook-delivery-jobs`, `auth-handoffs`, `audit`, `session-revocations` |

API is mounted at `/api` with `/api/health` and `/api/v1/*` (auth-gated). Auth subroutes include broker endpoints (`/auth/broker/launch/:appSlug`, `/broker/exchange`, `/broker/introspect`, `/broker/handoff`) and session endpoints (`/auth/session`, `/auth/logout`, `/auth/me`).

## 4. Key Architectural Decisions

### 4.1 Auth Broker — portal as IdP for sub-apps
- Portal authenticates the user via Firebase/GIP and a `__session` cookie.
- Relying-party apps redirect users to `/api/auth/broker/launch/:appSlug`; portal mints a per-app HS256-signed token and hands off via one of: `same_host_cookie`, `token_exchange`, `one_time_code`.
- `app_registry` row drives handoff mode and (planned in Spec 01) a per-app `broker_signing_secret`.
- Today: a single `PORTAL_BROKER_SIGNING_SECRET` env var is shared across all apps — known security gap, Spec 01 priority 1.

### 4.2 Webhook Fanout — durable in-DB queue + in-process worker
- `webhook-dispatcher` attempts inline POST; on failure, inserts a row in `webhook_delivery_jobs`.
- `webhook-delivery-worker` polls every 30s with `SKIP LOCKED`, retries 30s → 2min → disable after 3 failures.
- Started from `apps/api/src/index.ts` at boot (skipped under `NODE_ENV=test`).
- Spec 05 plans migration to **Cloud Tasks** with a Pub/Sub dead-letter queue, removing the in-process loop (incompatible with Cloud Run scale-to-zero).

### 4.3 Health Probe — in-process interval today
- `startHealthProbeInterval()` runs as `setInterval` alongside the API.
- Same scale-to-zero issue as webhook worker; Spec 05 step 6 plans migration to Cloud Scheduler hitting `POST /api/v1/admin/health-probe`.

### 4.4 Web App: Static SPA → SSR (planned)
- `adapter-static` with `index.html` fallback served by Elysia catch-all (`GET /*`).
- Auth check is client-side only → flash of unauthenticated content.
- Spec 05 plans `adapter-node` + `hooks.server.ts` with direct `validateSession` import (no loopback HTTP) and Elysia-mounted SvelteKit handler (single-process Option B).

### 4.5 Drizzle Migrations — generated only
- **Project rule (CLAUDE.md):** never hand-write migrations or `meta/_journal.json` entries. Always `drizzle-kit generate` so `when` timestamps stay correct (Drizzle uses high-water-mark comparison; manually-set timestamps cause silent skips in prod).
- Data-only migrations: make a trivial schema annotation change to force `drizzle-kit generate`, then replace SQL content in the generated `.sql` file.
- Migrations run via CI (`bun run --cwd apps/api db:migrate`) with Cloud SQL Auth Proxy.

### 4.6 Shared Types Package
- `@coms-portal/shared` lives in a separate GitHub repo (`mrdoorba/coms-shared`), pinned by git tag.
- Spec 03 covers contract distribution to Heroes (replacing duplicated types).

## 5. External Integrations
- **GIP / Firebase Auth** — primary identity provider (Google Workspace sign-in).
- **Google Sheets API** (`@googleapis/sheets`) — bidirectional employee-info sync.
- **Cloud SQL (Postgres)** via `postgres` driver + Drizzle.
- **Cloud Run** — single deployable service.
- **Workload Identity Federation** for CI → GCP auth (`infra/wif.tf`).
- **Relying-party apps** — Heroes today; receive signed broker tokens + webhooks.

## 6. Active Initiatives (rev1 specs)
1. **Spec 01** — Per-app broker signing keys, CSRF on broker launch, per-app introspect secrets *(security, do first)*
2. **Spec 02** — Provisioning bridge (`user.provisioned`/`user.updated` payloads with `appRole`, `branch`)
3. **Spec 03** — Distribute shared contracts to Heroes (replace duplicated types)
4. **Spec 04** — Resilience (introspect SWR cache, health probe robustness)
5. **Spec 05** — SSR migration + Cloud Tasks + Cloud Scheduler (long-term structural)

## 7. Conventions & Gotchas
- Bun-native runtime — avoid heavy gRPC SDKs (Spec 05 deliberately uses Cloud Tasks REST API + `google-auth-library` instead of `@google-cloud/tasks` to skip gax/grpc-js).
- Eden client (`@elysiajs/eden`) gives the web app type-safe API calls from the workspace `@coms-portal/api` import.
- Route-group `(authed)` in `apps/web/src/routes/` is the gate for authed pages — Spec 05 hook checks `event.route.id?.startsWith('/(authed)')`.
- Tests under `apps/api/src/__tests__/` and `apps/api/src/middleware/__tests__/` use Bun's test runner; e2e under `tests/e2e/` uses Playwright.
