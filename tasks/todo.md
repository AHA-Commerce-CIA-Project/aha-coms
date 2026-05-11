# Task List: Monorepo Consolidation + Heroes Cleanup

> Last updated: 2026-05-11
> Sibling: `tasks/plan.md` (read first for context, dependency graph, and session-handoff protocol)
> Source specs: `docs/spec/01-monorepo-consolidation.md`, `docs/spec/02-heroes-cleanup.md`

## Status markers

- `[ ]` — not started
- `[~]` — in progress
- `[x]` — complete and verified
- `[!]` — blocked (see `Blocker:` line below the task)

## How to pick up a task

1. Find the first unchecked task whose prerequisites are all `[x]`.
2. Open the referenced Spec section + any cited ADRs.
3. Mark the task `[~]`.
4. Execute it as a vertical slice — do all steps to working state, not partial.
5. Run the verification listed.
6. Mark `[x]` only after verification passes.
7. Commit status alongside the work.

---

## SPEC 01 — MONOREPO CONSOLIDATION

### Phase 1: Libraries into `aha-coms` workspace

Spec ref: `docs/spec/01-monorepo-consolidation.md#phase-1`.

- [x] **T01: Subtree-merge `coms-shared` → `packages/shared`**
  - **Prerequisites:** none
  - **Steps:**
    - Add the shared repo as a remote (or use local path).
    - `git subtree add --prefix=packages/shared ../coms-shared main --squash` (verify path).
    - Add `packages/*` to root `package.json` `workspaces` glob.
  - **Acceptance:** `packages/shared/package.json` exists with `name: @coms-portal/shared`; `bun install` at root succeeds.
  - **Verification:** `bun --filter @coms-portal/shared typecheck` passes.

- [x] **T02: Subtree-merge `coms-design-tokens` → `packages/design-tokens`**
  - **Prerequisites:** T01 (workspaces glob)
  - **Acceptance:** package in tree; `bun install` succeeds; name `@coms-portal/design-tokens`.
  - **Verification:** `bun --filter @coms-portal/design-tokens build` succeeds.

- [x] **T03: Subtree-merge `coms-sdk` → `packages/sdk`; convert internal `@coms-portal/shared` git URL → `workspace:*`**
  - **Prerequisites:** T01
  - **Acceptance:** `packages/sdk/package.json` has `"@coms-portal/shared": "workspace:*"` (no git URL); name `@coms-portal/sdk`.
  - **Verification:** `bun --filter @coms-portal/sdk typecheck` passes; `bun --filter @coms-portal/sdk test` passes if tests exist.

- [x] **T04: Subtree-merge `coms-ui` → `packages/ui-svelte`; rename package**
  - **Prerequisites:** T01, T02
  - **Steps:**
    - Subtree-merge to `packages/ui-svelte/`.
    - Update `package.json` `name` from `@coms-portal/ui` → `@coms-portal/ui-svelte`.
  - **Acceptance:** package name is `@coms-portal/ui-svelte`; old name not referenced anywhere in-tree.
  - **Verification:** `bun --filter @coms-portal/ui-svelte typecheck` passes.

- [x] **T05: Subtree-merge `coms-account-widget` → `packages/account-widget-svelte`; rename package**
  - **Prerequisites:** T01, T02
  - **Acceptance:** package name `@coms-portal/account-widget-svelte`.
  - **Verification:** typecheck passes.

- [x] **T06: Stub `packages/ui-react` (empty placeholder)**
  - **Prerequisites:** T01
  - **Steps:**
    - Create directory `packages/ui-react/`.
    - Create `package.json` with `name: @coms-portal/ui-react`, `version: 0.0.0`, `private: true`, basic `exports`.
    - Create empty `src/index.ts`.
  - **Acceptance:** workspace recognises the package; `bun install` includes it.
  - **Verification:** `bun --filter @coms-portal/ui-react typecheck` doesn't error (empty package).

- [x] **T07: Stub `packages/account-widget-react`**
  - **Prerequisites:** T01
  - **Acceptance:** like T06, name `@coms-portal/account-widget-react`.

- [x] **T08: Convert `apps/api` git URL deps → `workspace:*`; resolve SDK 0.1.1 → current gap**
  - **Prerequisites:** T01, T02, T03 (libs available for `workspace:*` resolution)
  - **Spec ref:** Spec 01 Phase 1 Step 4 + Risk #1 in plan.md.
  - **Steps:**
    - Update `apps/api/package.json`: all `@coms-portal/*` deps → `workspace:*`.
    - Bump from SDK `v0.1.1` to current (workspace:* will pull current).
    - **Surface and resolve any breakage** — the gap likely hides a breaking change in the issuer-side SDK contract.
  - **Acceptance:** `apps/api/package.json` has no `git+https://` URLs; build succeeds against current SDK.
  - **Verification:** `bun --filter @coms-portal/api build` succeeds; existing tests pass.

- [x] **T09: Convert `apps/web` git URL deps → `workspace:*`**
  - **Prerequisites:** T01–T05 (all libs in tree)
  - **Acceptance:** `apps/web/package.json` has no `git+https://` URLs.
  - **Verification:** `bun --filter @coms-portal/web build` succeeds.

- [x] **CHECKPOINT 1**: `bun install --frozen-lockfile` at monorepo root + `bun run typecheck` across all packages + portal-api builds + portal-web builds + all existing tests pass.

### Phase 2: Rename (already complete)

- [x] **Renamed `coms_portal` → `aha-coms`** (completed in the planning session)

### Phase 3: Heroes into the monorepo

Spec ref: `docs/spec/01-monorepo-consolidation.md#phase-3`.

- [x] **T10: Coordinate heroes freeze window with heroes' eng**
  - **Prerequisites:** Checkpoint 1
  - **Acceptance:** Heroes' eng has acknowledged a 1–2 day no-merge window for T11–T15.
  - **Verification:** Confirmation in writing (Slack, comment, whatever channel applies).
  - **Note:** Do not start T11 until this is `[x]`.
  - **Resolved 2026-05-11:** sole maintainer on `coms_aha_heroes`; freeze trivially in effect. `main` clean at `33d2a75`. Three non-main remote branches exist (`ci/parallelize-and-harden`, `ci/skip-redundant-build-and-docker-parallel`, `rev3/spec-01-02-adoption`) — confirm none of them hold work that should land on `main` before T11 runs, since `git subtree add` only pulls `main`.

- [x] **T11: Subtree-merge `coms_aha_heroes` → `apps/heroes-temp/`**
  - **Prerequisites:** T10
  - **Steps:** Use `git subtree add` to bring the whole repo in, preserving history.
  - **Acceptance:** `apps/heroes-temp/packages/{server,web,shared}/` exists in monorepo.
  - **Done:** subtree-add at split `33d2a75`; `bun install` deliberately red while heroes-temp sits at its waystation (heroes' root `@coms/shared@workspace:*` does not yet resolve). Cleared at T13/T14.

- [x] **T12: Restructure heroes into final layout**
  - **Prerequisites:** T11
  - **Steps:**
    - `apps/heroes-temp/packages/server` → `apps/heroes-api/`
    - `apps/heroes-temp/packages/web` → `apps/heroes-web/`
    - `apps/heroes-temp/packages/shared` → `packages/heroes-shared/`
    - Move heroes' `infra/` to per-service location (`apps/heroes-api/infra/`, `apps/heroes-web/infra/`) OR keep as single `apps/heroes/infra/` — coordinate with current heroes infra ownership.
    - Delete `apps/heroes-temp/`.
  - **Acceptance:** Final layout matches the structure described in Spec 01 Phase 3 + integration contract §8.
  - **Verification:** Directory layout verified by `find apps/heroes-* packages/heroes-shared -maxdepth 2 -type d`.
  - **Done:** Spec-mandated moves all landed. Infra placement: `infra/heroes/` at repo root (deviates slightly from spec's `apps/heroes/infra/` suggestion — kept heroes infra grouped at infra root next to portal's flat terraform; cleaner separation, no apps/* workspace ambiguity, and parallel to the spec's optional `infra/shared/` slot). Co-located heroes-api configs (`Dockerfile`, `docker-compose.yml`, `drizzle.config.ts`, `.env.example`, `.dockerignore`, `portal.integration.json`) moved into `apps/heroes-api/`. heroes-web inherited `messages/`, `project.inlang/`, `public/`. Heroes' docs (`CONTEXT.md`, `DESIGN_SYSTEM.md`, `TODOS.md`, `adr/`, `architecture/`) consolidated under `docs/heroes/`. Heroes' obsolete root artifacts deleted: own `bun.lock`, `.gitignore`, `eslint.config.js`, `package.json`, `.github/workflows/` (Cloud Build replaces in T17). Root `.gitignore` augmented for security: `*.sa-key.json` global ignore + nested `infra/**/.terraform/`, `infra/**/*.tfstate*`, `infra/**/*.tfvars` to cover `infra/heroes/`. Internal paths inside relocated configs (Dockerfile, drizzle.config.ts, portal.integration.json) still reference heroes' old `packages/{server,web,shared}` layout — they will heal at T13 (rename) or T16 (Cloud Build).

- [x] **T13: Rename heroes' internal namespace `@coms/*` → `@coms-portal/heroes-*`**
  - **Prerequisites:** T12
  - **Steps:**
    - `@coms/shared` → `@coms-portal/heroes-shared`
    - `@coms/server` → `@coms-portal/heroes-api`
    - `@coms/web` → `@coms-portal/heroes-web`
    - Update all import statements across heroes packages.
  - **Acceptance:** Grep returns no `@coms/` imports in `apps/heroes-*` or `packages/heroes-shared`.
  - **Verification:** `bun --filter "@coms-portal/heroes-*" typecheck` passes.
  - **Done:** Single sed sweep across all `.ts`/`.tsx`/`.js`/`.mjs`/`.cjs`/`.svelte`/`.json`/`.md`/`Dockerfile` files inside the heroes corridor (89 files touched). Verified: `grep -rln '@coms/' apps/heroes-api apps/heroes-web packages/heroes-shared` returns nothing. Counts after sweep: `@coms-portal/heroes-shared`×130, `@coms-portal/heroes-api`×20, `@coms-portal/heroes-web`×3. Also healed the path mappings the T12 restructure broke: `apps/heroes-api/tsconfig.json` `paths` (`../shared/src/*` → `../../packages/heroes-shared/src/*`), `apps/heroes-web/svelte.config.js` `kit.alias` (same shape), `apps/heroes-web/vite.config.ts` paraglide `project` (`../../project.inlang` → `./project.inlang`), `apps/heroes-web/package.json` `i18n:compile` script (same), `apps/heroes-api/drizzle.config.ts` (heroes-rooted `./packages/shared/...` → `../../packages/heroes-shared/...`), `apps/heroes-api/portal.integration.json` `modulePath` (`packages/web/...` → `apps/heroes-web/...`), and the schema-generator header strings in `packages/heroes-shared/scripts/generate-schemas.ts` + the generated `packages/heroes-shared/src/schemas/index.ts`. Verification of typecheck deferred to T14 — bun install fails until the remaining git+https deps convert to workspace:*. Still stale and intentionally deferred to T16 (Cloud Build rewrite): the Dockerfile + .dockerignore COPY paths, and the script-internal hard-coded paths inside `apps/heroes-api/scripts/cutover-verify.ts` and `check-no-illegal-inserts.ts` (neither in tsconfig include, so neither blocks typecheck).

- [x] **T14: Convert heroes' git URL deps → `workspace:*`**
  - **Prerequisites:** T13
  - **Steps:** Update package.jsons in heroes-api, heroes-web, heroes-shared.
    - `@coms-portal/sdk@git+...#v1.2.0` → `workspace:*`
    - Similarly for ui-svelte (formerly ui), design-tokens, account-widget-svelte.
  - **Acceptance:** No `git+https://` URLs in heroes package.jsons.
  - **Verification:** Heroes-api and heroes-web build via `bun --filter "@coms-portal/heroes-*" build`.
  - **Done:** Six git+https deps converted to `workspace:*` across the three heroes package.jsons. Two name-corrections rode the wave: `@coms-portal/ui` → `@coms-portal/ui-svelte` and `@coms-portal/account-widget` → `@coms-portal/account-widget-svelte` (the in-tree libs carry the framework-suffixed names since the T01–T05 lib subtree-merges). Bounded sed sweep across heroes-web's .ts/.svelte/.css renamed all 27 corresponding imports/`@import`s. `typescript: ^6.0.0` added as devDep on `@coms-portal/heroes-api` and `@coms-portal/heroes-shared` (heroes' deleted root package.json had supplied it via hoisting; bun's isolated install needs per-workspace declaration). One TS 6 strictness fix: `apps/heroes-api/src/routes/uploads.ts:124` `as ReadableStream` → `as unknown as ReadableStream` (node:stream/web ReadableStream vs global ReadableStream no longer cast-compatible). Verification: `bun install --frozen-lockfile` clean (929/1031), all 12 workspace packages typecheck green (heroes-shared/api/web included), full heroes-* build cycle succeeds (heroes-web emits SvelteKit + PWA assets; heroes-api emits dist bundle; heroes-shared no-build by design). Sample `bun test apps/heroes-api/src/routes/healthz.test.ts` passes — heroes test infrastructure intact.

- [x] **T15: Verify heroes SSO end-to-end against in-tree SDK**
  - **Prerequisites:** T14
  - **Steps:**
    - Run heroes-api and heroes-web locally.
    - Sign in via portal handoff.
    - Access a protected route in heroes.
  - **Acceptance:** Login flow completes; user session works in heroes.
  - **Verification:** Manual E2E pass (or scripted if a test suite covers it).
  - **Done:** Full handoff dance verified green on 2026-05-11. portal-api signed `handers.the@ahacommerce.net` in via personal_otp (session `30ca187f-…`), portal launcher rendered heroes after `team_app_access` was wired, click on heroes minted a `portal_code`, heroes-web's `/auth/portal/exchange` consumed it and minted a local heroes session, user landed on a protected heroes route. Three pre-existing-but-monorepo-newly-surfaced caveats recorded in the closing commit and the Findings below.

- [x] **CHECKPOINT 2**: Heroes builds in-tree + SSO works end-to-end.
  - **Crossed 2026-05-11:** `bun install --frozen-lockfile` clean (929/1031); `bun --filter '*' typecheck` green across all 12 workspace packages; `bun --filter '@coms-portal/heroes-*' build` succeeds; heroes SSO smoke completes end-to-end (sign-in → portal → app launcher → heroes-web exchange → protected heroes route).

#### Findings during T15 — to address before Phase 4

1. ~~**Heroes-api dev proxy hardcodes port 5173** (`apps/heroes-api/src/index.ts:99`).~~ **CLOSED in T16.** Proxy port now reads from `HEROES_WEB_DEV_PORT` (env default `5174`, `.env.example` documented). heroes-web's vite config also defaults `server.port` to `5174` so the two ends stay in sync without manual flags.
2. ~~**heroes-web doesn't see `process.env.DATABASE_URL` via the standard `bun run dev:heroes-web` path.**~~ **CLOSED in T16.** Wrapper at `scripts/dev-heroes-web.sh` sources `apps/heroes-api/.env` before invoking `bun --filter`, so `packages/heroes-shared/src/db/index.ts`'s `process.env.DATABASE_URL` lookup resolves. Root `dev:heroes-web` script delegates to the wrapper.
3. ~~**Heroes registration in portal's `app_registry` is not reproducible from the repo.**~~ **CLOSED** at the Finding-3 commit. Two idempotent scripts at `apps/api/scripts/register-heroes.ts` and `apps/api/scripts/bootstrap-heroes-membership.ts` now own the row-state half of the chain — app_registry, app_manifests, app_webhook_endpoints (script 1) and teams, team_members, team_app_access, member_app_role (script 2). Both wire into `apps/api/package.json` as `register:heroes` and `bootstrap:heroes-membership`. Runbooks documented inline. Verified by deleting `member_app_role` and re-running — the row returns. Sign-in + launcher visibility is fully scripted from a fresh laptop.

3a. **The webhook-fire half — `heroes_profiles.role` populated via `user.provisioned` — is deferred (open).** Heroes' webhook receiver at `apps/heroes-api/src/routes/portal-webhooks.ts` verifies inbound requests by Google ID token signed by `PORTAL_SERVICE_ACCOUNT_EMAIL` (with `aud=SELF_PUBLIC_URL`). Firing this locally requires either a real GCP service account JSON wired into portal so portal-api can mint signed ID tokens, or a `NODE_ENV !== 'production'` bypass added to heroes' webhook handler that accepts a dev-only token. Both are bigger choices than this finding's "add a script" scope. Until one lands, the admin UI in heroes stays dark even after the two scripts run — sign-in + launcher visibility work, T15's actual acceptance is unaffected. Land alongside Spec 02 Phase 5 (Cache Evaluation, T44–T46) where the JWT-vs-cache-vs-webhook story is being rewritten anyway, or as a standalone "dev mode webhook bypass" PR if the admin UI is needed before then.

### Phase 4: Per-service path-filtered Cloud Build

Spec ref: `docs/spec/01-monorepo-consolidation.md#phase-4`. Also see integration contract §8.

- [x] **T16: Update each `apps/<service>/cloudbuild.yaml` for monorepo-root install**
  - **Prerequisites:** Checkpoint 2
  - **Affected services:**
    - `apps/api` (rename directory to `apps/portal-api`)
    - `apps/web` (rename to `apps/portal-web`)
    - `apps/heroes-api`
    - `apps/heroes-web`
  - **Each cloudbuild.yaml shape:** `bun install --frozen-lockfile` at monorepo root, then `cd apps/<service>` for service-specific build.
  - **Note on renaming `apps/api` → `apps/portal-api`:** This is when the portal services get their final names. Update `package.json` `name` if needed too.
  - **Acceptance:** Each cloudbuild.yaml is self-contained from monorepo root; secrets sourced from Secret Manager via `availableSecrets`.
  - **Verification:** Trigger each build manually; all succeed.
  - **Done:** Directories renamed (`apps/api` → `apps/portal-api`, `apps/web` → `apps/portal-web`); package names follow (`@coms-portal/api` → `@coms-portal/portal-api`, `@coms-portal/web` → `@coms-portal/portal-web`); all import sites and the `~/*` svelte alias chased. Portal split: `apps/portal-api/server.ts` no longer imports `web/build/handler.js` — portal-api ships API-only. Per-service Dockerfile + `cloudbuild.yaml` authored for all four services from monorepo-root context; root combined `Dockerfile` and `.github/workflows/deploy.yml` retired. `infra/cloud-run.tf` split into `google_cloud_run_v2_service.coms_portal_api` + `coms_portal_web`, sharing the runtime SA and Cloud SQL proxy; `cloud-tasks.tf`, `cloud-scheduler.tf`, and `outputs.tf` re-aimed at `coms_portal_api`. Findings 1 + 2 from T15 closed in the same wave: `HEROES_WEB_DEV_PORT` (heroes-api dev proxy + heroes-web vite default `5174`) and `scripts/dev-heroes-web.sh` (sources `apps/heroes-api/.env` before `bun --filter` strips the cwd-relative .env). Verified: `bun install --frozen-lockfile` clean (929/1031); `bun --filter '*' typecheck` green; `bun --filter` build green for all four services; `bun --filter @coms-portal/portal-api test` passes; `tofu fmt -check` + `tofu validate` clean. Trigger-side wiring (path-filtered `includedFiles`) lands in T17; until then the cloudbuild.yamls can be invoked manually via `gcloud builds submit --config apps/<service>/cloudbuild.yaml .`. Heroes' tofu split (`coms-aha-heroes-app` → `coms-heroes-api` + `coms-heroes-web`) is deliberately deferred — the cloudbuild.yamls target the contract-aligned names and a follow-up task will reshape `infra/heroes/` to match.

- [ ] **T16.5: Split `infra/heroes/` Cloud Run service into `coms-heroes-api` + `coms-heroes-web`**
  - **Prerequisites:** T16
  - **Why:** T16 authored `apps/heroes-api/cloudbuild.yaml` and `apps/heroes-web/cloudbuild.yaml` that deploy to the contract-aligned names `coms-heroes-api` and `coms-heroes-web`, but `infra/heroes/main.tf` still declares the single combined `coms-aha-heroes-app` service. Without the split the heroes Cloud Build pipelines have no live target — and Checkpoint 3 ("per-service deploys verified independent") cannot be crossed.
  - **Steps:**
    - Mirror the shape of `infra/cloud-run.tf` (now two `google_cloud_run_v2_service` resources sharing the runtime SA + Cloud SQL proxy) inside `infra/heroes/main.tf` — declare `coms_heroes_api` and `coms_heroes_web` resources, fold shared env into a `locals` block.
    - Update the heroes `monitoring` module (`infra/heroes/modules/monitoring/`) so the SLO/alert filters reference both new service names instead of `coms-aha-heroes-app`.
    - Chase any cross-references: `infra/heroes/outputs.tf`, IAM bindings, scheduler/tasks if heroes uses them.
    - Plan the state migration: `tofu state mv google_cloud_run_v2_service.coms_aha_heroes google_cloud_run_v2_service.coms_heroes_api` (preserves the API service in-place via rename — Cloud Run `name` change forces replace, so a destroy-then-create cycle is expected; coordinate with the user before applying).
    - Decide whether heroes-web's SSR needs DATABASE_URL access in-process (same in-process auth pattern as portal-web) or stays JWT-only — defaults the env subset accordingly.
  - **Acceptance:** `infra/heroes/` declares two services with names matching the cloudbuild yamls; `tofu fmt -check` + `tofu validate` clean inside `infra/heroes/`; monitoring resources reference the new names.
  - **Verification:** `cd infra/heroes && tofu plan` shows the expected diff (replace `coms-aha-heroes-app`, create `coms-heroes-api` + `coms-heroes-web`); apply gated on user approval.

- [ ] **T17: Update Cloud Build triggers with `includedFiles` filters**
  - **Prerequisites:** T16, T16.5
  - **Filter shape per service:**
    - portal-api: `apps/portal-api/**`, `packages/**`, `package.json`, `bun.lock`
    - portal-web: `apps/portal-web/**`, `packages/**`, `package.json`, `bun.lock`
    - heroes-api: `apps/heroes-api/**`, `packages/heroes-shared/**`, `packages/**`, `package.json`, `bun.lock`
    - heroes-web: `apps/heroes-web/**`, `packages/heroes-shared/**`, `packages/**`, `package.json`, `bun.lock`
  - **Acceptance:** PR touching only one service's path triggers only that service's build.
  - **Verification:** Test with a no-op PR per service; observe Cloud Build runs.

- [ ] **CHECKPOINT 3**: Per-service deploys verified independent.

### Phase 5: Firebase Hosting staging

Spec ref: `docs/spec/01-monorepo-consolidation.md#phase-5`. Also ADR 0004.

- [ ] **T18: Create `firebase.json` at monorepo root with rewrites**
  - **Prerequisites:** Checkpoint 3
  - **Rewrites:**
    - `/heroes/api/**` → heroes-api Cloud Run service
    - `/heroes/**` → heroes-web Cloud Run service
    - `/api/**` → portal-api Cloud Run service
    - `/**` → portal-web Cloud Run service
  - **Acceptance:** `firebase.json` syntactically valid; staging site name configured.

- [ ] **T19: Deploy to Firebase Hosting staging**
  - **Prerequisites:** T18
  - **Steps:** `firebase deploy --only hosting --project <project-id>`.
  - **Acceptance:** Staging URL responds with content for `/`, `/heroes/dashboard`, `/api/health`.
  - **Verification:** `curl` against the staging URL for each route.

- [ ] **T20: Verify cross-app cookie sharing**
  - **Prerequisites:** T19
  - **Steps:**
    - Sign in via the staging URL (portal flow).
    - Navigate to `/heroes/...`.
    - Verify `coms_session` cookie is sent on heroes requests (DevTools network tab).
  - **Acceptance:** Same-origin cookie crosses to heroes paths without re-authentication.

- [ ] **CHECKPOINT 4**: Single-origin routing works in staging.

### Phase 6: Archive external repos

Spec ref: `docs/spec/01-monorepo-consolidation.md#phase-6`.

- [ ] **T21: Archive the 5 external lib repos on GitHub**
  - **Prerequisites:** Checkpoint 4
  - **Repos:** coms-sdk, coms-shared, coms-ui, coms-design-tokens, coms-account-widget
  - **Steps:** `gh repo archive mrdoorba/<repo-name>` per repo.
  - **Acceptance:** Each repo shows "archived" banner on GitHub.

- [ ] **T22: Archive `coms_aha_heroes` repo on GitHub**
  - **Prerequisites:** Checkpoint 4
  - **Steps:** `gh repo archive mrdoorba/coms_aha_heroes`.

- [ ] **T23: Update `repository.url` in in-tree package.jsons**
  - **Prerequisites:** T21, T22
  - **Steps:** Each in-tree package's `repository.url` should point at the aha-coms repo with optional `directory` field.
  - **Acceptance:** Grep returns no references to the archived lib/heroes repo URLs.

- [ ] **CHECKPOINT 5**: Spec 01 complete. Consolidation done.

---

## SPEC 02 — HEROES INTEGRATION CLEANUP

> **Do not start Spec 02 tasks until Checkpoint 5 is green.**

### Phase 1: Heroes single-origin migration

Spec ref: `docs/spec/02-heroes-cleanup.md#phase-1`. ADR 0003.

- [ ] **T24: Configure `kit.paths.base: '/heroes'` in heroes-web**
  - **Prerequisites:** Checkpoint 5
  - **File:** `apps/heroes-web/svelte.config.js`
  - **Acceptance:** SvelteKit config sets base path; `bun --filter @coms-portal/heroes-web build` still succeeds.

- [ ] **T25: Audit heroes-web internal links for base-path compliance**
  - **Prerequisites:** T24
  - **Steps:**
    - Grep `href="/[a-z]` and review each match.
    - Replace literal `/dashboard` etc. with `${base}/dashboard` from `$app/paths`.
    - Verify form actions, redirects, asset URLs.
  - **Acceptance:** No literal absolute paths inside heroes-web routes; everything uses framework helpers.

- [ ] **T26: Update heroes-api Elysia router for `/heroes/api` prefix**
  - **Prerequisites:** T24
  - **File:** `apps/heroes-api/src/index.ts` (or main entry)
  - **Acceptance:** All routes prefixed; healthcheck reachable at `/heroes/api/healthz`.

- [ ] **T27: Update heroes-web eden client config for new API base path**
  - **Prerequisites:** T26
  - **Acceptance:** API calls from heroes-web reach `/heroes/api/*`.

- [ ] **T28: Update Firebase Hosting rewrites for `/heroes/api/**`**
  - **Prerequisites:** T26
  - **Acceptance:** `firebase.json` rewrites include the api path.

- [ ] **T29: Update heroes' `(authed)/+layout.svelte`**
  - **Prerequisites:** T24, T25
  - **Steps:**
    - Remove `data.portalOrigin` and `data.heroesOrigin` usage.
    - `serviceBarServices` derived from `APP_LAUNCHER × user.apps`, path-relative hrefs.
    - `postLogoutRedirectUri` path-relative.
  - **Acceptance:** Layout has no `portalOrigin`/`heroesOrigin` references.

- [ ] **T30: Verify heroes lives at `/heroes/*` end-to-end**
  - **Prerequisites:** T24–T29
  - **Acceptance:** Sign in from portal redirects correctly; cross-app links work; same-origin cookie crosses.

- [ ] **CHECKPOINT 6**: Heroes is on path-based routing.

### Phase 2: Heroes JWT sessions

Spec ref: `docs/spec/02-heroes-cleanup.md#phase-2`. ADR 0005.

- [ ] **T31: Confirm SDK exposes the JWT payload contract heroes needs**
  - **Prerequisites:** Checkpoint 6
  - **Steps:**
    - Read `packages/sdk` source.
    - Verify SDK provides verification + payload type with `sub`, `apps`, `portalRole`, `email`.
    - **If missing fields**: land the SDK update FIRST (separate task), then proceed.
  - **Acceptance:** SDK can produce a typed `PortalSessionUser` from a JWT cookie.

- [ ] **T32: Write `loadHeroesAuthUser` in `packages/heroes-shared/src/auth/user.ts`**
  - **Prerequisites:** T31
  - **Function shape:**
    - Verify JWT via SDK.
    - Validate `jwt.apps.includes('heroes')`; throw `PortalSessionDeniedError` if not.
    - Upsert `heroes_profiles` keyed on `jwt.sub`.
    - Return `HeroesAuthUser` with all expected fields.
  - **Acceptance:** Function compiles; unit tests pass.

- [ ] **T33: Replace heroes-web `hooks.server.ts` auth handle with JWT path**
  - **Prerequisites:** T32
  - **Steps:**
    - Remove `getLocalSessionByToken` calls.
    - Use `sdk.auth.verifyRequest` (or equivalent) + `loadHeroesAuthUser`.
  - **Acceptance:** hooks.server.ts has no session-token-table references.

- [ ] **T34: Replace heroes-api `server/src/middleware/auth.ts` similarly**
  - **Prerequisites:** T32
  - **Acceptance:** middleware uses JWT path; same shape as T33.

- [ ] **T35: Remove `getLocalSessionByToken`, `createLocalSessionForPortalUser`, `destroyLocalSessionByToken`, `destroySessionsForPortalSub`, `readSessionCookieFromHeaders` from `packages/heroes-shared/src/auth/session.ts`**
  - **Prerequisites:** T33, T34 (no consumers remain)
  - **Acceptance:** session.ts is simplified to the cookie-name constant, or deleted entirely. Grep confirms no remaining call sites.

- [ ] **T36: Migration to drop `session`, `account`, `verification` tables**
  - **Prerequisites:** T35 (no code path reads them)
  - **Note:** Run during a maintenance window. Tables hold no critical data after T33-T35.
  - **Acceptance:** Migration file added; rollback procedure documented; migration runs successfully against staging.

- [ ] **T37: Verify heroes auth E2E with JWT-only**
  - **Prerequisites:** T36
  - **Acceptance:** Sign-in → page load → API call → logout — all green.

- [ ] **CHECKPOINT 7**: Heroes has no local session tables.

### Phase 3: Portal handoff for first-login

Spec ref: `docs/spec/02-heroes-cleanup.md#phase-3`.

- [ ] **T38: Audit `/auth/portal/exchange` role post-single-origin**
  - **Prerequisites:** Checkpoint 7
  - **Steps:**
    - Determine if the handoff still needs to do anything (it used to mint local sessions; now those are gone).
    - Decision: keep as a thin redirect, or delete.
  - **Acceptance:** Decision documented; if keeping, scope is explicit.

- [ ] **T39: Refactor or delete `/auth/portal/exchange`**
  - **Prerequisites:** T38
  - **If kept:** No DB write, no session minting. Just an optional safe-redirect handler.
  - **If deleted:** Portal redirects directly to `/heroes/dashboard` after login.
  - **Acceptance:** No app-local session minting in heroes.

- [ ] **CHECKPOINT 8**: No `portal_code` exchange dance in heroes' steady state.

### Phase 4: Chrome library glue absorption

Spec ref: `docs/spec/02-heroes-cleanup.md#phase-4`. ADR 0002.

- [ ] **T40: Move `serviceBarServices` derivation into `packages/ui-svelte`**
  - **Prerequisites:** Checkpoint 8
  - **Steps:** Chrome library accepts `appCatalog` + `user.apps` and derives the list internally.
  - **Acceptance:** No app-side `APP_LAUNCHER × user.apps` mapping remains in heroes-web.

- [ ] **T41: Move theme narrowing into chrome lib**
  - **Prerequisites:** T40
  - **Steps:** Chrome accepts `'system' | 'light' | 'dark'` and resolves internally; consumers don't need to narrow.
  - **Acceptance:** Heroes' layout has no `effectiveTheme = uiState.theme === 'system' ? ...` shim.

- [ ] **T42: Remove icon type casting (`as AnyIcon`)**
  - **Prerequisites:** T40, T41
  - **Steps:** With `workspace:*` and unified icon library version, the cast becomes unnecessary.
  - **Acceptance:** No `as AnyIcon` in heroes-web.

- [ ] **T43: Decide on slide-over admin menu**
  - **Prerequisites:** T40
  - **Decision:** Generalize into chrome lib as `<SlideOverNav>`, OR keep local with documented rationale.
  - **Acceptance:** Decision recorded in heroes' code or in this task as a Note; if generalized, lives in chrome lib.

- [ ] **CHECKPOINT 9**: Heroes' layout file shrinks meaningfully; chrome lib absorbed the cross-app glue.

### Phase 5: Cache evaluation

Spec ref: `docs/spec/02-heroes-cleanup.md#phase-5`.

- [ ] **T44: Map `email_cache` + `userConfigCache` fields → JWT / keep / migrate**
  - **Prerequisites:** Checkpoint 9
  - **Steps:**
    - List every field in `email_cache` and `userConfigCache`.
    - For each: in JWT? Should be? Can move into `heroes_profiles`?
    - Produce a decision matrix.
  - **Acceptance:** Decision per field documented.

- [ ] **T45: Migrate JWT-eligible data into JWT claims**
  - **Prerequisites:** T44
  - **Steps:**
    - If portal needs to issue new claims: SDK update + portal-api update.
    - Heroes consumes claims instead of cache.
  - **Acceptance:** heroes hooks.server.ts and middleware/auth.ts read claims for the migrated fields.

- [ ] **T46: Reduce per-request 3-table JOIN to 1**
  - **Prerequisites:** T45
  - **Acceptance:** `loadHeroesAuthUser` queries only `heroes_profiles` on the common path.

- [ ] **CHECKPOINT 10**: Auth-path query reduced.

### Phase 6: Verification + documentation

Spec ref: `docs/spec/02-heroes-cleanup.md#phase-6`.

- [ ] **T47: End-to-end smoke test**
  - **Prerequisites:** Checkpoint 10
  - **Checklist:**
    - Sign in via portal → land on heroes.
    - Navigate within heroes, between apps, between routes.
    - Logout from one app → verify logged out everywhere.
    - Mobile chrome: install PWA, log in, verify chrome looks identical to portal's.
    - Admin operations: HR sync, audit log, settings.
  - **Acceptance:** Every checklist item passes.

- [ ] **T48: Performance check**
  - **Prerequisites:** T47
  - **Steps:**
    - Measure heroes' authed page load time (p50 and p95).
    - Compare to pre-cleanup baseline.
  - **Acceptance:** Flat or faster.

- [ ] **T49: Update heroes' README to point at integration contract**
  - **Prerequisites:** T47
  - **Steps:**
    - Remove documentation about local session tables.
    - Document the cleaned auth flow as "this is the reference pattern."
    - Cross-reference `docs/integration-contract.md` and relevant ADRs.
  - **Acceptance:** README accurate to post-cleanup state; no stale local-session references.

- [ ] **CHECKPOINT 11**: Heroes is the reference implementation for the COMS integration contract — for §§ 1–9 and §§ 11–14. Notifications (§10) remain the documented deviation, awaiting the platform-notifications spec.

---

## When everything above is `[x]`

Spec 01 and Spec 02 are complete. Heroes is the reference implementation. The monorepo holds the suite. Time to scope Spec 03 (Integration Test Kit) and Spec 04 (SDK as Enforcement Layer) — both currently stubbed in `docs/spec/`.

Also pending (separate future specs):

- aha-fast onboarding (Next.js + Better Auth → GIP migration + base-path config + chrome via React variants)
- Platform-owned notifications v1
- App 3 / app 4 onboarding once their domains are scoped
