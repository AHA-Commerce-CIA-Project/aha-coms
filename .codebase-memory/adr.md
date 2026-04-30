# Architecture Decision Record — coms-aha-heroes

> Status: Living document. Last updated 2026-04-30.
> Companion specs: `docs/architecture/rev1/spec-00..05.md`, `docs/architecture/rev3/spec-00..05.md` (mirrored from portal), and `heroes-team-handoff.md`. Design-system contribution workflow: `/DESIGN_SYSTEM.md`.

---

## 1. Project Identity

**Name:** `coms-aha-heroes` (npm: `coms-aha-heroes`, version 0.1.0, private monorepo).
**Purpose:** "Heroes" employee recognition / points / rewards portal for AHA Commerce, served as a single Cloud Run service that bundles a SvelteKit frontend behind an Elysia (Bun) API.
**Trust posture:** Internal employee-facing app. Authentication is delegated to the COMS Portal (centralised identity), so this codebase is a *relying party*, not an identity provider.

## 2. Tech Stack

| Layer | Choice | Notes |
|------|--------|-------|
| Runtime | **Bun** | `bun --hot` for dev, `bun build … --target bun` for prod. |
| API | **Elysia 1.3** | Mounted at `/api` and `/api/v1`. CORS, custom error handler, cache-control middleware. |
| Frontend | **SvelteKit 2 + Svelte 5** | Built with Vite 6, served via `svelte-adapter-bun` handler imported by the Elysia process at runtime. |
| Styling / UI | Tailwind v4, `@coms-portal/ui` v1.2.0 (chrome shells + 15 shadcn-style primitive families — Button/Card/Dialog/Select/Sheet/Tabs/Avatar/Badge/Input/Label/Table/Textarea/Separator/Skeleton/DropdownMenu, plus `cn()` helper), `bits-ui`, `lucide-svelte`, `tailwind-variants`, `layerchart` | After 2026-04-30 round-trip, primitives ship from `mrdoorba/coms-ui` only — the local `packages/web/src/lib/components/ui/` directory is gone (deleted in commit `b7b7431`, 103 files / 2,276 lines net). Tokens still live in Heroes' own `app.css` for now (Phase 2 adoption pending). |
| i18n | Paraglide (inlang), cookie + `preferredLanguage` strategy | |
| ORM / DB | **Drizzle 0.45** + `postgres` driver, Postgres on Cloud SQL | Migrations under `packages/shared/src/db/migrations`. |
| Validation | TypeBox (`@sinclair/typebox`) + `drizzle-typebox` | Schemas re-exported from `@coms/shared/schemas`. |
| Type-safe RPC | `@elysiajs/eden` | Web imports `@coms/server` directly to derive client types. |
| Storage | `@google-cloud/storage` (signed URLs for receipts/attachments) | |
| Sheets sync | `@googleapis/sheets` | Async job table + scheduler service. |
| Package manager | Bun workspaces (`packages/*`), `bun.lock` | |
| Tests | Bun's built-in test runner (`*.test.ts` colocated) | Coverage is sparse — only a handful of test files (uploads, healthz, portal-webhooks, sheet-sync-helpers, storage). |

## 3. Repository Layout

```
coms-aha-heroes/
├── packages/
│   ├── server/   @coms/server  — Elysia API + bootstraps SvelteKit handler
│   │   └── src/{routes, services, repositories, middleware}, auth.ts, api-client.ts
│   ├── web/      @coms/web     — SvelteKit app, routes under src/routes/{(authed),auth/portal,…}
│   └── shared/   @coms/shared  — DB schema, drizzle migrations, TypeBox schemas, auth/session, constants, types
├── infra/        Terraform (cloud-run, cloud-sql, artifact-registry, storage, sheet-sync, monitoring, github-wif)
├── docs/architecture/rev1/  Active rev — specs 00–05 + heroes-team-handoff.md
├── messages/     Paraglide message catalogues
├── .github/workflows/  ci.yml, deploy.yml
├── Dockerfile + docker-compose.yml
└── drizzle.config.ts (root)
```

Three-package monorepo, all `workspace:*` linked. `@coms/web` depends on `@coms/server` (for Eden RPC types), and both depend on `@coms/shared`.

## 4. Architectural Decisions

### AD-1 — Single Cloud Run service serves both API and SPA
The Elysia app mounts the SvelteKit build at runtime (`packages/server/src/index.ts:68+`). In dev it does not; in prod it dynamically imports `web/build/handler.js`. This trades horizontal-scale flexibility for one deploy artifact and shared cookies. **Spec 05 calls for migrating from static SPA to SSR** (`adapter-static` → `adapter-node`/Bun) so route guards run server-side and there is no flash of unauthenticated content.

### AD-2 — Auth is portal-delegated, not local
Heroes does **not** issue sessions. The flow is portal-redirect → `/auth/portal/exchange` → cookie. See `routes/auth/portal/{exchange,logout}` on the web side and `packages/server/src/auth.ts` on the server. Recent commits (0dbab9c, b641cb7) tightened the broker exchange. Spec 04 added a stale-while-revalidate cache for introspect (commit ccd9039: "Cache revoked session introspect results to prevent stale un-revocation"). Webhooks from the portal land at `POST /api/webhooks/portal` (`routes/portal-webhooks.ts`).

### AD-3 — Layered server: routes → services → repositories
- `routes/*` are Elysia plugins, one per resource (users, teams, points, rewards, redemptions, appeals, challenges, comments, notifications, dashboard, leaderboard, reports, audit-logs, settings, sheet-sync, uploads, portal-webhooks, health, healthz). They handle HTTP concerns and TypeBox validation.
- `services/*` hold business logic (approval, audit, points, rewards, redemptions, leaderboard, dashboard, sheet-sync + scheduler, settings + cache, storage, auth-sync).
- `repositories/*` wrap Drizzle queries (`base.ts` provides shared utilities). Tables: appeals, audit-logs, categories, challenges, comments, notifications, points, redemptions, rewards, settings, sheet-sync, teams, users.

Keep this separation — routes should not import Drizzle directly.

### AD-4 — Shared package is source-only (no build step)
`@coms/shared`'s build script is a no-op; consumers import TS directly. This works because Bun + Vite both consume TS natively. Avoid adding compiled artifacts here.

### AD-5 — Schemas live in `@coms/shared/schemas`, generated from Drizzle via TypeBox
`generate:schemas` script regenerates them. Treat the file as derived; edit `db/schema/*` then regenerate.

### AD-6 — Session contract shared across portal + heroes
`@coms/shared/auth/session` and the external git dependency `@coms-portal/shared` (pinned to `v1.1.0`) carry the cross-app contract. Bumping that pin is a coordinated change with the portal team.

### AD-7 — Sheet sync is async with job tracking
`sheet-sync-jobs` table + `sheet-sync-scheduler` service + `POST /api/sheet-sync-trigger` (unauthed, infra-triggered) + authed `/api/v1/sheet-sync/{trigger,resync,jobs,jobs/:id,status}`. Designed to outlive a single request lifecycle but currently still in-process (Spec 05 proposes Cloud Tasks).

### AD-8 — Branch-aware provisioning for multi-country employees
Recent work (5fae8b3) added branch awareness to portal webhook provisioning. `branches` table + `branch` field in `user.provisioned`/`user.updated` payloads. Default-branch fallback when payload `branch` is null/unmatched.

## 5. External Dependencies & Boundaries

- **COMS Portal** — identity provider, sends webhooks (`user.provisioned`, `user.updated`, plus revocation events). Heroes consumes; never originates.
- **Postgres / Cloud SQL** — primary store. Migrations are authoritative.
- **Google Cloud Storage** — signed URLs for uploads; bucket(s) managed by Terraform module `infra/modules/storage`.
- **Google Sheets** — read source for sheet-sync; OAuth/service-account creds managed in infra.
- **`@coms-portal/shared`** v1.1.0 — git-pinned shared contracts package. Treat as an external semver-ish dependency. **Out of date: portal is at v1.4.1.** Bumping is a coordinated change with the portal team; v1.4.1 added `APP_LAUNCHER` deprecation shim (Rev 3 §03c).
- **`@coms-portal/ui`** v1.2.0 — git-pinned UI package; sole source of chrome shells + shadcn-style primitives across the COMS suite. After 2026-04-30 (commit `b7b7431`) Heroes adopted v1.2.0 end-to-end and deleted its local `ui/` directory. Future primitive changes go upstream to `mrdoorba/coms-ui` and propagate via tag bump — see `/DESIGN_SYSTEM.md` for the contribution workflow. Direct dependencies pulled in by `@coms-portal/ui`: `bits-ui`, `clsx`, `tailwind-merge`, `tailwind-variants`, `lucide-svelte` (already present in Heroes at matching versions).
- **`@coms-portal/design-tokens`** — NOT yet pinned. Heroes' `app.css` owns the suite tokens locally (Spec 02 Phase 2 adoption pending). When Phase 2 is pulled forward, swap to `@import "@coms-portal/design-tokens/css"`.
- **`@coms-portal/account-widget`** — NOT yet pinned. Spec 01 Heroes adoption pending (~1 week, scheduled per `heroes-integration-handoff.md`).

## 6. Conventions

- **Workspace scripts:** Use `bun run --filter=<pkg> <script>` from root; root `dev` runs server only.
- **Type checking:** `bun run typecheck` runs every package's `typecheck` script. Web's typecheck depends on i18n compile + `svelte-kit sync`.
- **DB workflow:** `db:generate` (drizzle-kit) → review SQL → commit migration → `db:migrate` deploys. Never hand-edit historic migrations.
- **Tests:** Colocated `*.test.ts`, run via Bun. There is no global test command yet — invoke `bun test <path>`.
- **i18n:** Add keys in `messages/*.json`; Paraglide compiles into `packages/web/src/lib/paraglide` at build time.

## 7. Open / Active Initiatives

### Rev 1 (closed, kept for reference)

| Spec | Title | Status hook |
|------|-------|-------------|
| 00 | Implementation timeline | Index/overview |
| 01 | Security hardening | Mostly portal-side |
| 02 | Provisioning bridge (`user.provisioned`/`user.updated`) | **Heroes H1+H2 — implemented (commit 5fae8b3)** |
| 03 | Contract distribution via `@coms-portal/shared` | **H3 done — package now consumed at v1.1.0** |
| 04 | Resilience (introspect SWR cache, health probes) | **H4 done — commit ccd9039** |
| 05 | Architecture: SSR migration + Cloud Tasks for webhook delivery | Not started in Heroes |

### Rev 3 (active — mirrors portal's `docs/architecture/rev3/`)

| Spec | Title | Heroes status |
|------|-------|----------------|
| 01 | Shared Account Widget | **Pending Heroes adoption** (~1 week, mount `@coms-portal/account-widget` per `docs/architecture/rev3/heroes-integration-handoff.md`) |
| 02 Phase 1+2+3 | Design system: docs + tokens + chrome | Phase 2 (token consumption) + Phase 3 (chrome migration) **pending** in Heroes; Heroes' `app.css` still owns tokens locally |
| 02 Phase 4 | Design system: primitives | ✅ **shipped Heroes-side 2026-04-30** (commit `b7b7431` — adopted `@coms-portal/ui v1.2.0`, deleted local `ui/`, 24 files rewired) |
| 03 | User identity ownership + alias layer | **Pending Heroes adoption — critical-path** (~2 weeks Heroes engineering + coordinated cutover; must land before real users; see `docs/architecture/rev3/spec-03-user-identity-alias-layer.md` §Appendix A) |
| 03b/c/d | Test-gate cleanup, pre-Spec-4 hardening, deferred backlog | Portal-only; no Heroes work |
| 04, 05 | User preferences, suite search | Deferred; trigger has not fired |

Critical-path next: Spec 03 Heroes adoption (rename `users` → `heroes_profiles`, drop user-creation paths, build resolve-batch caller + alias_cache + pending-resolution queue + webhook consumer + audit log writer). Spec 01 Heroes adoption is parallel and can ship independently.

## 8. Things to Be Careful About

- **Don't bypass the portal for auth.** Anything that mints local sessions or stores passwords belongs in the portal, not here. The legacy `change-password` route exists but is on the deprecation path.
- **Webhook handler is idempotent and authoritative for user state** — duplicate `user.provisioned` events must not double-create. Lookup-by-email then upsert.
- **Cloud Run scale-to-zero kills in-process workers.** The sheet-sync scheduler currently lives in the API process; long-running background work will die mid-flight. Plan accordingly until Spec 05 lands.
- **Eden RPC couples `@coms/web` to `@coms/server` types.** Breaking changes in route response shapes break the web typecheck — that's intentional, treat type errors as a useful signal.
- **Don't fork primitives back into a local `ui/` directory.** As of 2026-04-30 (Spec 02 Phase 4 round-trip), all primitives ship from `mrdoorba/coms-ui` v1.2.0 — Heroes' historical `packages/web/src/lib/components/ui/` is gone for a reason. If you need a new variant or component, open a PR upstream to `mrdoorba/coms-ui`; do not reintroduce a local copy. Workflow at `/DESIGN_SYSTEM.md`. The fork drift between Heroes' local primitives and the platform package is exactly what Spec 02 Phase 4 closed; reopening it silently is a regression that the design-system contract treats as forbidden.
- **`cn()` comes from `@coms-portal/ui/primitives` now**, not from local `$lib/utils.ts`. Heroes' `utils.ts` still exports `buildSearchParams` and other Heroes-specific helpers, but `cn` and the four shadcn type helpers (`WithoutChildren`, `WithoutChild`, `WithoutChildrenOrChild`, `WithElementRef`) were stripped on 2026-04-30 and now live upstream.
- **`@coms-portal/shared` is at v1.1.0** but portal is at **v1.4.1.** This is an out-of-date pin. v1.4.1 added the `APP_LAUNCHER` deprecation shim (Rev 3 §03c) — bumping unblocks the launcher migration on Heroes' side. Coordinate with portal team before bumping.
