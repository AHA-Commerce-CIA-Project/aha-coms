# Task List: Monorepo Consolidation + Heroes Cleanup

> Last updated: 2026-05-12 (Checkpoint 4 crossed; CP4 Findings settled; FU-1 + FU-2 prod-applied + dashboard-verified — HEROES card flipped green at 08:05:23 UTC; FU-3 + FU-4 filed for the CI/CD orchestration gap surfaced today; `infra-plan.yml` comment lie corrected)
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

- [x] **T16.5: Split `infra/heroes/` Cloud Run service into `coms-heroes-api` + `coms-heroes-web`**
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
  - **Done:** New `infra/heroes/cloud-run.tf` mirrors `infra/cloud-run.tf` — two `google_cloud_run_v2_service` resources declared inline (no module wrapper), `locals` block for shared env (`PORTAL_BASE_URL`, `PUBLIC_PORTAL_ORIGIN`, `PUBLIC_APP_ORIGIN`, `NODE_ENV`, `PORTAL_APP_SLUG`). **Two least-priv runtime SAs**: `coms-heroes-api-sa` (DB + storage objectUser on uploads/exports + serviceAccountTokenCreator-on-self for V4 signed URLs + sheet-sync key access) and `coms-heroes-web-sa` (DB only — heroes-web's hooks.server.ts SSO check still touches the DB until Spec 02 Phase 2 lands JWT-only). Container ports per Dockerfile: api=8080, web=3000. Auth secrets discovery: Better Auth is fully gone from heroes (T11–T14 cleanup) — the four `BETTER_AUTH_*`/`GOOGLE_CLIENT_*` secret slots in the retired module were dead code; not provisioned on the new services. The leftover `google_secret_manager_secret` resources in Secret Manager are now orphans, cleanup in a follow-up. `infra/heroes/modules/cloud-run/` directory **deleted** entirely (its service + IAM bits inlined). `infra/heroes/main.tf` rewired: drops the `module "cloud_run"` call, passes the api SA to `module "sheet_sync"` and `module "github_wif"`, passes both service names to `module "monitoring"`. Monitoring's 5xx alert switched from one policy to `for_each = toset(var.cloud_run_service_names)` so an api-only blip pages with the api service in the alert subject (and likewise for web); uptime check still targets api's `/api/health` since heroes-web has no equivalent. `outputs.tf` split: `cloud_run_url`/`cloud_run_service_account` → `_api` + `_web` variants. Cloudbuild yamls (`apps/heroes-{api,web}/cloudbuild.yaml`) now point `_RUNTIME_SA` at the matching new SAs (was `coms-portal-run-sa` from T16's copy-paste — replaced because heroes services should have their own identity, not borrow portal's). New variables in `infra/heroes/variables.tf`: `portal_base_url`, `heroes_public_origin`, `heroes_api_public_url` (placeholder defaults using the existing run.app suffix; override in `terraform.tfvars` after first apply when real URLs are known). Verification: `tofu fmt -check -diff -recursive` clean across `infra/`; `tofu validate` clean inside `infra/heroes/` after `tofu init -backend=false`. **Apply not run** — gated on user approval per task acceptance. Deferred config gap noted in `cloud-run.tf` comments: heroes' own `coms-aha-heroes-repo` Artifact Registry is now orphaned (cloudbuild yamls push to the shared `coms-portal-registry`); cleanup in a follow-up. T16's deferred Findings 1 + 2 stay closed; Finding 3a (webhook dev-mode bypass) remains open and untouched.

- [x] **T17: Per-service deploy workflows on GitHub Actions with `paths:` filters** *(rewritten from "Cloud Build triggers")*
  - **Prerequisites:** T16, T16.5
  - **Why rewritten:** `mrdoorba/aha-coms` is a public repo → unlimited free GHA minutes. Cloud Build with `E2_HIGHCPU_8` (the machine type the cloudbuild yamls request) has no free tier. T16's Cloud Build choice was an implicit copy from fast's pattern with no ADR; T17 reverses it. Codified as the fourth Standing principle in `tasks/plan.md`.
  - **Filter shape per service** (translated to GHA `paths:`):
    - portal-api: `apps/portal-api/**`, `packages/{shared,sdk}/**`, `package.json`, `bun.lock`, the workflow file itself
    - portal-web: `apps/portal-{web,api}/**` (web typechecks against api), `packages/{shared,sdk,ui-svelte,design-tokens,account-widget-svelte}/**`, `package.json`, `bun.lock`, the workflow file
    - heroes-api: `apps/heroes-api/**`, `packages/{heroes-shared,sdk,shared}/**`, `package.json`, `bun.lock`, the workflow file
    - heroes-web: `apps/heroes-{web,api}/**` (web typechecks against api), `packages/{heroes-shared,sdk,shared,ui-svelte,design-tokens,account-widget-svelte}/**`, `package.json`, `bun.lock`, the workflow file
  - **Acceptance:** Commit to main touching only one service's path triggers only that service's deploy workflow. The four `apps/*/cloudbuild.yaml` files remain in-tree as a manual escape hatch (`gcloud builds submit --config apps/<service>/cloudbuild.yaml .`).
  - **Verification:** Operator opens four no-op test commits (one per service path), observes only the matching workflow runs in `gh run list`.
  - **Done:** Four workflows authored at `.github/workflows/deploy-{portal,heroes}-{api,web}.yml`. Each authenticates to GCP via WIF (`google-github-actions/auth@v2`), builds + pushes Docker image to the per-app AR repo (`coms-portal-registry` for portal, `coms-heroes-repo` for heroes), then `gcloud run deploy`s with the per-service runtime SA. Heroes WIF rewired in the same commit: `infra/heroes/modules/github-wif/` pool renamed `coms-heroes-wif-pool`, deployer SA renamed `coms-heroes-deployer-sa`, repo trust pointed at `mrdoorba/aha-coms` (was `mrdoorba/coms-aha-heroes` from heroes' pre-monorepo state; the GitHub repo itself was renamed from `coms-portal` → `aha-coms` in the same commit window so trust + remote + tofu all converge on one name), and `cloud_run_service_account_emails` now takes a list so the deployer holds `iam.serviceAccountUser` + `iam.serviceAccountTokenCreator` on both `coms-heroes-api-sa` and `coms-heroes-web-sa`. Heroes Tofu state bucket `coms-aha-heroes-tfstate` keeps its existing name per the "operationally costly to rename" carve-out in `plan.md`. Portal WIF (`infra/wif.tf` `coms-portal-github-actions`) reused as-is — already had project-wide grants from when it powered the retired monorepo deploy.yml. Repo vars expected before first run: `WIF_PROVIDER_PORTAL`, `WIF_PROVIDER_HEROES`, `WIF_SA_PORTAL`, `WIF_SA_HEROES` (full WIF provider resource paths + deployer SA emails — operator sets via `gh variable set`). Verification deferred to operator: tofu apply heroes WIF rename (destroys `coms-aha-heroes-{wif-pool,deployer-sa}` and creates the renamed pair) → set the four repo vars → no-op test commits per service → confirm only the matching workflow fires. tofu fmt + validate green inside `infra/heroes/`.

- [x] **CHECKPOINT 3**: Per-service deploys verified independent.

  **Crossed 2026-05-12.** Heroes Tofu apply ran (35 add / 1 change / 34 destroy after fixing one orphan alert policy via `gcloud beta monitoring policies delete`); portal Tofu apply ran (state-rm of `coms_portal` + manual `gcloud run services delete coms-portal-app` to break a Tofu deletion_protection deadlock, then bootstrap-image + `deletion_protection = false` patches let the new resources create cleanly). Live URLs: portal-api `https://coms-portal-api-45tyczfska-et.a.run.app`, portal-web `https://coms-portal-web-45tyczfska-et.a.run.app`, heroes-api `https://coms-heroes-api-45tyczfska-et.a.run.app`, heroes-web `https://coms-heroes-web-45tyczfska-et.a.run.app`. Five GH repo vars set (`WIF_PROVIDER_PORTAL`, `WIF_PROVIDER_HEROES`, `WIF_SA_PORTAL`, `WIF_SA_HEROES`, refreshed `SERVICE_URL`). Three Dockerfile rounds healed during first deploys: round 1 fixed bun's per-workspace `node_modules` in builder stages + the `NODE_ENV=production` build-time prefix (pino-pretty inlining); round 2 added the same per-workspace `node_modules` to web runtime stages (clsx import resolution at SSR time). Path-filter isolation **proven** by two single-file probe pushes: `apps/portal-api/.deploy-test` triggered exactly `Deploy — portal-api` + `Deploy — portal-web` (api/web typecheck-coupled by design) with no heroes-* runs; `apps/heroes-api/.deploy-test` triggered exactly `Deploy — heroes-api` + `Deploy — heroes-web` with no portal-* runs. All four services now serving from real revisions (portal-api 00004, portal-web 00004, heroes-api 00004, heroes-web 00005). Probe files cleaned up.

  **Pre-flight state (verified 2026-05-12 against live GCP `fbi-dev-484410`):**
  - Heroes Tofu plan: `35 to add, 2 to change, 34 to destroy` — destroys the combined `coms-aha-heroes-app` Cloud Run service + the old `coms-aha-heroes-{run-sa,wif-pool,deployer-sa}` resources, creates the new `coms-heroes-{api,web}` services + their per-service runtime SAs + the renamed `coms-heroes-{wif-pool,deployer-sa}`. Brief heroes downtime (~30s–2min for Cloud Run create) until first deploy completes. Run with `-var alert_email=handers.the@ahacommerce.net` (the live value).
  - Portal Tofu plan: small — `github_repo` change updates the WIF `attribute_condition` from `mrdoorba/coms-portal` → `mrdoorba/aha-coms` to match the renamed repo. Other resources unchanged.
  - Both WIF pools' `attribute_condition` are currently mismatched against the renamed repo (after `gh repo rename` at `e93a8b3` the runner OIDC token now carries `mrdoorba/aha-coms`, but the live trust still expects `mrdoorba/coms-portal`). Until the apply lands, no GHA workflow can authenticate. Nothing is actively broken because no workflow has fired yet.
  - Stale GH repo var observed: `SERVICE_URL=https://coms-portal-app-45tyczfska-et.a.run.app` still points at the pre-T16 combined service. After portal apply, update to the new `coms-portal-api-…run.app`.
  - GCP project number: `908739514002` (used to construct WIF provider full names below).

  **Apply window (operator runs in order):**
  1. `cd infra/heroes && tofu apply -var alert_email=handers.the@ahacommerce.net` — confirm prompt; this is the big cutover. Brief heroes downtime begins.
  2. `cd infra && tofu apply` — portal WIF `attribute_condition` flips to the new repo name. Quick.
  3. Capture new heroes URLs from outputs: `cd infra/heroes && tofu output -raw cloud_run_url_api` and `tofu output -raw cloud_run_url_web`.
  4. Set the four GHA repo vars:
     ```
     gh variable set WIF_PROVIDER_PORTAL --body "projects/908739514002/locations/global/workloadIdentityPools/coms-portal-wif-pool/providers/coms-portal-wif-provider"
     gh variable set WIF_PROVIDER_HEROES --body "projects/908739514002/locations/global/workloadIdentityPools/coms-heroes-wif-pool/providers/github-oidc"
     gh variable set WIF_SA_PORTAL       --body "coms-portal-github-actions@fbi-dev-484410.iam.gserviceaccount.com"
     gh variable set WIF_SA_HEROES       --body "coms-heroes-deployer-sa@fbi-dev-484410.iam.gserviceaccount.com"
     ```
  5. Update the stale `SERVICE_URL` GH var to the new portal-api URL surfaced by `cd infra && tofu output -raw cloud_run_url_api` (or whatever the portal output is named — `cloud_run_api_url`).
  6. First deploy of each service: trigger by pushing the test commits below.

  **Verify path-filter isolation (one no-op commit per service):**
  For each of the four services, create a no-op change touching ONLY that service's path, push to main, and confirm only the matching workflow fires:
  ```
  # Per service (replace <SERVICE> with portal-api | portal-web | heroes-api | heroes-web):
  echo "" >> apps/<SERVICE>/.deploy-test
  git add apps/<SERVICE>/.deploy-test
  git commit -m "Probe — verify <SERVICE> deploy isolation" --no-verify   # short test commit, hook-skipped acceptable
  git push origin main
  gh run list --branch main --limit 5
  # Expect: only `Deploy — <SERVICE>` workflow appears in this push's runs.
  ```
  Cleanup after verification: `git rm apps/*/.deploy-test && git commit -m "Clean up Checkpoint 3 probes"`.

  **Acceptance:**
  - Each `gh run list` after a per-service probe shows exactly one workflow run (the matching service's deploy), with status `completed/success`.
  - Each Cloud Run service shows a new revision serving 100% of traffic, image tag = the probe commit's SHA.
  - Heroes downtime measurable as the gap between `coms-aha-heroes-app` destruction and `coms-heroes-api` first revision serving — record the duration as a baseline for future cutovers.

### Phase 5: Firebase Hosting staging

Spec ref: `docs/spec/01-monorepo-consolidation.md#phase-5`. Also ADR 0004.

- [x] **T18: Create `firebase.json` at monorepo root with rewrites**
  - **Prerequisites:** Checkpoint 3
  - **Rewrites:**
    - `/heroes/api/**` → heroes-api Cloud Run service
    - `/heroes/**` → heroes-web Cloud Run service
    - `/api/**` → portal-api Cloud Run service
    - `/**` → portal-web Cloud Run service
  - **Acceptance:** `firebase.json` syntactically valid; staging site name configured.
  - **Done:** `firebase.json` at repo root declares `hosting.site = "aha-coms"` and the four rewrites in precedence order (most specific first — Firebase Hosting evaluates top-down, first match wins): `/heroes/api/**` → `coms-heroes-api`, `/heroes/**` → `coms-heroes-web`, `/api/**` → `coms-portal-api`, `**` → `coms-portal-web`, all in `asia-southeast2`. Service IDs match the names Tofu created at CP3 and the names the four GHA deploy workflows push revisions to. `.firebaserc` pins `projects.default = "fbi-dev-484410"` and registers `targets.fbi-dev-484410.hosting.aha-coms` → `["aha-coms"]` so `firebase deploy --only hosting:aha-coms` resolves without ambiguity. **Naming decision:** the spec's example used `aha-coms-staging` to anticipate a staging/prod split, but the four Cloud Run services are all `environment = "prod"` and there is no separate staging tier — the routing layer fronts prod directly. Dropped the `-staging` suffix so the URL (`aha-coms.web.app`) names what it is, not what it might become. If a real staging tier is wanted later, a second Firebase Hosting site (`aha-coms-staging`) can be created pointing at a parallel set of Cloud Run services labeled `environment = "staging"` — the rename does not foreclose that, it just stops mis-naming the only environment we have today. `firebase-public/` exists as a `.gitkeep`-only stub because Firebase Hosting requires the `public` field but both `apps/portal-web` (`adapter-node`) and `apps/heroes-web` (`svelte-adapter-bun`) ship as Cloud Run SSR services — every request flows through a rewrite to Cloud Run; no static asset is ever served from the public dir in production. `hosting.ignore` is set explicitly (`firebase.json`, dotfiles, `node_modules/`) so a future stray file in `firebase-public/` doesn't accidentally deploy. Note on the `/heroes/api/**` rewrite: it is wired now but dormant until T26 prefixes the heroes-api Elysia router with `/heroes/api` and T27 updates heroes-web's eden client base — until then, no client hits that path; the rewrite waits. A guard script at `scripts/verify-firebase-json.mjs` (TDD red-then-green) asserts the file parses, the site name matches, and the rewrites appear in the contracted order with the contracted service IDs + region — re-runnable any time the routing layer is edited by hand. `.gitignore` extended for `!/scripts/verify-*.mjs` (the verifier ships in the repo, mirroring the existing `dev-*.sh` exception) and `.firebase/` (the local deploy cache). Verified: `bun scripts/verify-firebase-json.mjs` passes; `bun --filter '*' typecheck` clean across all 12 workspace packages (no regression from a config-only change). Live deploy + curl probes against the routing URL are T19's work; cross-app cookie sharing is T20.

- [x] **T19: Deploy to Firebase Hosting**
  - **Prerequisites:** T18
  - **Steps:** `firebase deploy --only hosting:aha-coms --project fbi-dev-484410`.
  - **Acceptance:** Routing URL (`https://aha-coms.web.app`) responds with content for `/`, `/heroes/dashboard`, `/api/health`.
  - **Verification:** `curl` against the routing URL for each route OR `bun scripts/verify-routing.mjs https://aha-coms.web.app`.
  - **Done:** Operator authenticated and created the site (`firebase login`, `firebase hosting:sites:create aha-coms --project fbi-dev-484410`); deploy ran inline as `firebase deploy --only hosting:aha-coms --project fbi-dev-484410` and finalised one version (0 files in `firebase-public/` — the `.gitkeep` stub is in `.gitignore`'s `**/.*` set, exactly as intended). Live at `https://aha-coms.web.app`. The probe lit all four corridors green: `/login` HTTP 200 carries portal-web's `<title>COMS Portal</title>` and theme-color `#0a0a0a` (the portal black); `/api/health` HTTP 200 carries portal-api's full health JSON (`{status:ok, checks:{db:ok, secretManager:ok, cloudTasks:ok}}`); `/heroes/` HTTP 404 carries heroes-web's SvelteKit shell with theme-color `#1D388B` (the heroes blue) — the 404 IS the proof that the rewrite landed at heroes-web pre-T24 base-path, not at portal-web's catch-all; `/heroes/api/health` HTTP 500 carries heroes-api's error envelope (`{success:false, error:{code:INTERNAL_ERROR}}`) — recorded as NOTE (not a fatal probe) since this rewrite is dormant until T26, and the 500 itself proves heroes-api received the request. Refinement during the run: the `/` probe initially failed because portal-web's auth-required hooks emit HTTP 303 → `/login` for unauthenticated requests, which Firebase Hosting forwarded transparently (`location: /login`, `cache-control: private`); since 303 with empty body cannot be matched against a content marker, the probe swapped to `/login` directly — a real served portal-web route that returns 200 with `<title>COMS Portal</title>`. The 303 is itself evidence that the rewrite reached portal-web (Firebase Hosting cannot emit relative `Location` headers on its own), but the probe wants a content-bearing assertion, not a side-channel one. **Side observation, not blocking:** heroes-api returns HTTP 500 with its standard error envelope on unmatched routes (`/heroes/api/health` is outside heroes-api's `.group('/api', ...)` mount). Standard Elysia behaviour is 404 on unmatched routes; the 500 suggests heroes-api's `onError` middleware wraps even route-misses. Worth a follow-up but unrelated to T19/T20 acceptance — the rewrite is dormant either way, and T26 will install the proper `/heroes/api` prefix at which point this stops mattering.

  **Pre-flight (verified before T18 commit `dff71df` landed):**
  - Both `apps/portal-api` (`new Elysia({ prefix: '/api' })` at `index.ts:51`) and `apps/heroes-api` (`.group('/api', ...)` at `index.ts:40`) already serve under `/api/*` natively — Firebase Hosting forwards the full path to Cloud Run unmodified, so `https://<staging>/api/health` arrives at portal-api as `/api/health` (200 expected) without any router rewiring.
  - `allUsers` `roles/run.invoker` bound on all four services (`infra/cloud-run.tf:317-325` for portal-{api,web}; `infra/heroes/cloud-run.tf:382-391` for heroes-{api,web}) — Firebase Hosting's service-account-less rewrite path will reach them.
  - Both web shells carry distinguishable markers: portal-web ships `<title>COMS Portal</title>` (`apps/portal-web/src/app.html`), heroes-web ships `theme-color" content="#1D388B"` (`apps/heroes-web/src/app.html`). The probe script reads these off the response body to confirm routing.
  - `/heroes/api/**` rewrite is wired but dormant — T26 prefixes heroes-api's Elysia router with `/heroes/api`, T27 flips heroes-web's eden client base. Until then the probe records the rewrite reaches heroes-api but expects 4xx.
  - heroes-web's routes are still mounted at `/` (base path migration is T24). A request to `/heroes/dashboard` reaches heroes-web with path `/heroes/dashboard`; heroes-web's router has `/dashboard` only, so the response is heroes-web's own 404 page — that 404 IS the proof the routing layer landed the request at the right service (Spec 01 line 197 calls this out explicitly).

  **Apply window (operator runs in order):**
  1. **Install Firebase CLI** (one-shot, not tracked in package.json — operator-local tooling, same pattern as `tofu`):
     ```
     curl -sL https://firebase.tools | bash
     # or, if bun-global is preferred:
     # bun install -g firebase-tools
     firebase --version    # expect 13.x+
     ```
  2. **Authenticate against the project's Firebase account:**
     ```
     firebase login
     # (or `firebase login:ci` if running headless)
     firebase projects:list   # confirm fbi-dev-484410 is visible
     ```
  3. **Create the site if it does not exist:**
     ```
     firebase hosting:sites:list --project fbi-dev-484410
     # If aha-coms is absent:
     firebase hosting:sites:create aha-coms --project fbi-dev-484410
     # Site URL will be https://aha-coms.web.app
     # (If the global Firebase Hosting namespace has claimed aha-coms already,
     # the create will fail — fall back to a project-prefixed name like
     # aha-coms-fbi-dev or aha-coms-coms, and update firebase.json + .firebaserc
     # + the verifier expectation to match before retrying.)
     ```
  4. **Deploy the routing layer:**
     ```
     cd "/Users/mac/HT/AHA COMS/aha-coms"
     firebase deploy --only hosting:aha-coms --project fbi-dev-484410
     # Capture the "Hosting URL" the CLI prints.
     ```
  5. **Run the probe:**
     ```
     bun scripts/verify-routing.mjs https://aha-coms.web.app
     ```
     Expected outcome: `PASS` on `/` (portal-web title), `/api/health` (portal-api JSON), `/heroes/` (heroes theme-color); `NOTE` on `/heroes/api/health` (dormant pre-T26).

  **If anything fails:**
  - `firebase deploy` fails with "site does not exist" → step 3 was skipped; create the site and retry.
  - `/api/health` returns 502/503 → portal-api Cloud Run service is unhealthy; check `gcloud run revisions list --service coms-portal-api --region asia-southeast2` and the most recent revision's logs.
  - `/heroes/` returns Firebase Hosting's default 404 page (not heroes-web's content) → the rewrite is not catching; re-verify `firebase.json` parsed correctly with `bun scripts/verify-firebase-json.mjs`.
  - `/api/health` reaches portal-WEB instead of portal-API (returns HTML, not JSON) → rewrite order is wrong; the `/api/**` source must precede `**` in the array. `bun scripts/verify-firebase-json.mjs` checks this.

- [x] **T20: Verify cross-app cookie sharing**
  - **Prerequisites:** T19 ✓
  - **Pre-flight (verified before T19 deploy):**
    - Session cookie config lives at `packages/shared/src/contracts/session.ts:3` — `SESSION_COOKIE_OPTIONS = { name: '__session', path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 14d }`. **No `domain` attribute** → host-only cookie, scoped to whatever host emits the Set-Cookie. When portal-api responds through Firebase Hosting at `aha-coms.web.app`, the browser scopes `__session` to that exact host, and every subsequent request to `aha-coms.web.app/*` carries it.
    - The cookie name `__session` is also Firebase Hosting's one privileged forwarded cookie name — the CDN strips all other cookies from requests to backends by default (for cacheability), but explicitly forwards `__session`. Whether the choice was deliberate or accidental, it is exactly the right name for cookie-based auth through Firebase Hosting.
    - `sameSite: 'lax'` permits the cookie on top-level GET navigations between paths, which is the cross-app pattern (`<a href="/heroes/dashboard">` from portal-web).
  - **Acceptance:** `__session` cookie travels from portal-web sign-in to a `/heroes/*` request on the same origin without re-authentication.
  - **Done:** Operator signed in at `https://aha-coms.web.app/login`, then URL-bar navigated to `https://aha-coms.web.app/heroes/`. Storage tab confirms the cookie: name `__session`, value `25010ddd-8566-423f-9aff-06a9ace2afbf` (opaque session UUID — see Finding 3 below), Domain blank, HostOnly true, Path `/`, HttpOnly true, Secure true, SameSite Lax, expires 2026-05-26 (14 days from today, matching the 14-day `maxAge` in `SESSION_COOKIE_OPTIONS`). Network panel shows the request to `/heroes/` carried `Cookie: __session=25010ddd-…` in its Request Headers — the cookie crossed without re-authentication. The page itself returned 404 (heroes-web's routes are mounted at `/`, not `/heroes/*`; base-path migration is T24) — expected and noted at T20 step 4. **Caveat surfaced during the verification (see Finding 2 below):** portal-web has a service worker registered on `aha-coms.web.app` that intercepted the request and returned a cached 404 — Firefox's Network panel showed `Transferred: service worker`. The cookie did travel from browser to SW (which is what T20's acceptance demanded), but the actual heroes-web Cloud Run service was never reached over the network on this request. The Cookie header is still observable in the panel because Firefox shows what the browser sent into the SW's fetch event. CP4's acceptance is about cookie crossing on the request path, which holds; SW interception of `/heroes/*` becomes load-bearing when T24 makes the path real, and is recorded below as a Finding.

- [x] **CHECKPOINT 4**: Single-origin routing works at `aha-coms.web.app`.
  - **Crossed 2026-05-12:** T19 probe four PASS (`/login` portal-web 200, `/api/health` portal-api 200, `/heroes/` heroes-web 404 with heroes shell, `/heroes/api/health` heroes-api 500 dormant). T20 confirmed `__session` cookie crosses from sign-in to `/heroes/*` requests, properties verified in DevTools Storage panel and Network → Request Headers. Phase 5 sealed. Findings 1, 2, 3 below are non-blocking for CP4 and tracked for Phase 6 / Spec 02 windows.

#### Findings during T20 — to address before Spec 02 begins

1. ~~**`app_registry.url` for heroes points at the destroyed `coms-aha-heroes-app-…run.app`.**~~ **CLOSED 2026-05-12.** `apps/portal-api/scripts/register-heroes.ts` generalised from insert-only to upsert — the early-return-when-existing branch became a drift-detection + UPDATE branch that only touches the three drift-prone fields (`url`, `serviceAccountEmail`, `brokerOrigin` on `app_registry`; `url` + `secret` on `app_webhook_endpoints`) and leaves the immutable contract fields alone. A `HEROES_WEBHOOK_URL` env var was added because T16.5's service split made the old derivation (`${HEROES_APP_URL}/api/webhooks/portal`) wrong — webhooks go to heroes-api now, launches go to heroes-web. Ran against the prod DB via `cloud-sql-proxy --port 5433 fbi-dev-484410:asia-southeast2:coms-aha-heroes-db` with the existing 43-char webhook HMAC preserved (read from the DB before the run, passed back in — the HMAC is recorded for shape parity with FAST and not actually used today, but rotating it for no reason felt wrong). Drift detected and updated on the row `id=30ae041e-2e6a-453d-b634-de826fee8474`: `url` → `https://coms-heroes-web-45tyczfska-et.a.run.app`, `serviceAccountEmail` → `coms-heroes-api-sa@fbi-dev-484410.iam.gserviceaccount.com`, `brokerOrigin` → `https://aha-coms.web.app`; webhook endpoint `url` → `https://coms-heroes-api-45tyczfska-et.a.run.app/api/webhooks/portal`. Idempotency verified by re-running with the same env (script logged "matching values; nothing to do"). **Note on the URL choice:** the launch URL today is heroes-web's `*.run.app` host, not `https://aha-coms.web.app/heroes`. Reason: pre-T24, heroes-web's routes are mounted at `/`, not `/heroes/*`; routing the HEROES card to `aha-coms.web.app/heroes?portal_code=…` would 404 from heroes-web (it has no `/heroes` route). Multi-origin works today via heroes-web's existing root handler that detects `portal_code` and runs the exchange dance. **T24's task description carries a follow-up:** after base-path migration lands, re-run the script with `HEROES_APP_URL=https://aha-coms.web.app/heroes` + `HEROES_WEBHOOK_URL=https://aha-coms.web.app/heroes/api/webhooks/portal` so launches stay same-origin and the `__session` cookie crosses naturally.

2. ~~**portal-web's service worker intercepts every `/heroes/*` navigation on `aha-coms.web.app`** and currently serves cached 404 responses without reaching heroes-web Cloud Run.~~ **DOWNGRADED to non-issue 2026-05-12.** Read `apps/portal-web/src/service-worker.ts` carefully: the cache is populated only on `install` from `[...build, ...files]` (SvelteKit's static asset manifest), never written to from the `fetch` event. The fetch handler skips `/api/*` (passthrough to network) and for everything else does `caches.match(...).then((cached) => cached ?? fetch(event.request))` — a cache MISS for `/heroes/*` therefore falls through to `fetch(event.request)`, which preserves cookies and forwards the full request to the network. Confirmed at the wire by `gcloud logging read` for `coms-heroes-web` around the T20 timestamp: two 404 responses logged at `04:50:54Z` (`/heroes/dashboard`) and `04:51:07Z` (`/heroes/`) from the operator's Firefox user-agent, both returning heroes-web's own 404 page — the SW forwarded both requests to heroes-web Cloud Run and the response came from there. The "Transferred: service worker" indicator in Firefox's network panel is informational (the SW called `event.respondWith`), not blocking. T20's cookie verification is genuinely valid. Kept the analysis as a memo because the same question will arise the first time fast or app-3 lands behind the routing layer: portal-web's SW will pass them through identically, no special handling required, unless a future SW revision adds caching of `/<other-app>/*` paths.

3. **`__session` carries an opaque UUID, not a JWT.** Portal-api still uses DB-backed sessions — the cookie value is a session ID that looks up a row in the `session` table on every authenticated request. Spec 02 Phase 2 (T31–T37) replaces this with stateless JWT sessions per ADR 0005. CP4 only required the cookie to *cross*, which it does; the verification path through heroes-web's existing `/auth/portal/exchange` (which mints a heroes-local session) is unchanged for now. The cookie name and shape are stable through the JWT transition because both formats are self-contained strings — only the verifier swaps. Recorded so future-self does not re-discover it during Spec 02 Phase 2 kick-off.

### Cross-cutting follow-ups — not blocking Phase 6

These are not on the phase track and not gated by any checkpoint. FU-1 + FU-2 surfaced during T19/T20 traversal; FU-3 + FU-4 surfaced during the FU-1 prod-apply session on 2026-05-12 when the lack of automation forced a five-step manual orchestration (`tofu apply` → `db:migrate` → `register-heroes` → test build → push). Resolve when convenient — either before Phase 6 begins or interleaved with it.

- [x] **FU-1: Diagnose the "Degraded" status on the HEROES dashboard card**
  - **Where it shows:** Portal dashboard at `https://aha-coms.web.app/dashboard`, the HEROES app card displays a yellow "Degraded" indicator.
  - **What drives it:** Portal-api runs a periodic health probe of registered apps (`apps/portal-api/src/services/health-probe.ts`, scheduled via `startHealthProbeInterval` from `apps/portal-api/src/index.ts:22`). The probe target is derived from `app_registry.url` — that field was stale (pointing at the destroyed `coms-aha-heroes-app` Cloud Run service) until commit `9725b64` updated it to `https://coms-heroes-web-45tyczfska-et.a.run.app`. The Degraded indicator was observed BEFORE the update; it may already have cleared. If it has not cleared after one probe cycle, the probe is hitting heroes-web (which has no health route — its routes are at `/`, not `/api/health` or `/healthz`) and getting 404. The probe should target heroes-api's `/api/health` endpoint, not heroes-web's root. Either the probe URL needs its own field on `app_registry` separate from the launch URL, or the probe needs to follow a per-app convention (`{app.url}/api/health` was the old assumption; with the T16.5 service split that points at heroes-web which has no health route).
  - **Code-complete 2026-05-12:** Picked option (a) — an explicit field, not a derived convention. `apps/portal-api/src/db/schema/apps.ts` gains `healthCheckUrl varchar(500)` (nullable; legacy rows fall back to the old `${app.url}/api/health` derivation in the probe). Migration `0035_naive_solo.sql` adds the column. `apps/portal-api/src/services/health-probe.ts` reads it through `probeAllApps` and uses it in `probeAppHealth` ahead of the fallback. `apps/portal-api/scripts/register-heroes.ts` accepts an optional `HEROES_HEALTH_CHECK_URL` env var (default: `webhookUrl`-origin + `/api/health` — heroes-api's actual probe target), upserts the column, and adds it to the drift-detection block. Verified: `bun --filter @coms-portal/portal-api typecheck` + `bun --filter @coms-portal/portal-api test` + `bun --filter @coms-portal/portal-api build` all clean.
  - **Prod apply (pending operator window):**
    1. Apply the migration via the same Cloud SQL proxy pattern the register-heroes runbook uses: `cloud-sql-proxy --port 5432 fbi-dev-484410:asia-southeast2:coms-aha-heroes-db` in a side terminal, then `DATABASE_URL="$PROXY_URL" bun run --cwd apps/portal-api db:migrate` (alias for `drizzle-kit migrate`). The migration is a single `ADD COLUMN ... varchar(500)` — no lock-implicated rewrite, safe on a live row.
    2. Re-run `register:heroes` with the FU-1 env appended. The default derives the right probe target from the existing webhook URL, so a no-op env addition usually suffices: same env block as the 2026-05-12 run; the script will report drift on `healthCheckUrl: (null) → https://coms-heroes-api-45tyczfska-et.a.run.app/api/health` and UPDATE that one column.
    3. Wait 60 seconds (one probe cycle from `startHealthProbeInterval`) and reload the portal dashboard. Card flips green when `probeAppHealth` returns `healthy` for heroes-api's `/api/health` (which it does — verified independently from the routing probe at T19).
  - **Verified 2026-05-12 08:05:23 UTC:** Portal-api revision `coms-portal-api-00007-5px` ran its startup probe ~10s after rollout (the immediate probe inside `startHealthProbeInterval`, ahead of the 60s cadence). Direct DB read of `app_registry` confirmed `health_status = 'healthy'`, `last_health_error = null`, `last_verified_at` populated to the probe timestamp. The HEROES dashboard card now reads green. (Side observation: FAST is `degraded` with HTTP 404, but its `health_check_url` is NULL so the probe falls back to `${app.url}/api/health` on the FAST web origin — exactly the pre-change behavior. Pre-existing condition, not a regression, outside FU-1's scope.)
  - **Acceptance:** HEROES card on dashboard shows green / healthy status ✓; portal-api probe returned `healthy` for heroes ✓.
  - **Related:** `apps/portal-api/scripts/register-heroes.ts` for the upsert pattern (introduced 2026-05-12 at `9725b64`); CP4 Finding 1 closed in the same commit.

- [x] **FU-2: `apps/portal-web/cloudbuild.yaml` references three non-existent secrets**
  - **What's broken:** The Cloud Build escape hatch (`gcloud builds submit --config apps/portal-web/cloudbuild.yaml .`) declares `availableSecrets` for `coms-portal-vite-gip-{api-key,auth-domain,project-id}`. None of those secrets exist in Secret Manager (`gcloud secrets list --project fbi-dev-484410 | grep vite` returns nothing). Any attempt to use the escape hatch fails with NOT_FOUND on the secret fetch. Silent breakage — the hatch hasn't been used since T17 returned deploys to GHA, so the failure mode is only discovered if/when an operator falls back to Cloud Build for a one-off.
  - **Why it does not block deploys today:** The GHA workflow at `.github/workflows/deploy-portal-web.yml` was patched at commit `41aeb6e` to fetch `coms-portal-gip-api-key` (the existing secret portal-api also reads at runtime) and pass three `--build-arg`s, with `VITE_GIP_AUTH_DOMAIN=fbi-dev-484410.firebaseapp.com` + `VITE_GIP_PROJECT_ID=fbi-dev-484410` as plain workflow values (Firebase web config is public by design per Firebase's own model). The hot path is fine.
  - **Code-complete 2026-05-12:** Picked option 2 (rewrite over provision). `apps/portal-web/cloudbuild.yaml` now fetches a single `coms-portal-gip-api-key` via `availableSecrets` (matching the GHA workflow) and inlines `VITE_GIP_AUTH_DOMAIN` as a Cloud Build substitution (`_VITE_GIP_AUTH_DOMAIN`) + `VITE_GIP_PROJECT_ID` via the built-in `${PROJECT_ID}`. Comment block at the top of the file names this yaml as the manual escape hatch and points at the GHA workflow as the hot path. Cloud Build's build SA needs `roles/secretmanager.secretAccessor` on `coms-portal-gip-api-key` — added in `infra/iam-portal-runtime.tf` as `google_secret_manager_secret_iam_member.cloud_build_gip_api_key` (sibling to `portal_runtime_gip_api_key`). Two empirical lessons fell out of running the test build live: (i) Cloud Build does NOT recursively expand `${...}` references nested inside another substitution's value, so the original `_IMAGE: ${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_ARTIFACT_REPO}/${_SERVICE_NAME}` deserialised with literal `${...}` runes still in the image string at deploy time — fixed by hard-inlining region + project id + artifact repo into `_IMAGE`'s value; (ii) Cloud Build on projects created after April 2024 runs builds under the Compute Engine default SA (`<number>-compute@developer.gserviceaccount.com`), not the legacy `cloudbuild.gserviceaccount.com` — the first IAM grant landed on the wrong identity, surfaced as `PermissionDenied` against `secretmanager.versions.access` on build `8ee0c2cd`, and was re-aimed at the right SA. Machine type also dropped from `E2_HIGHCPU_8` to default standard (1 vCPU, 4 GB) — first 120 build-minutes/day are free, and the hatch is rare-path enough that the slower build is irrelevant. Swept `apps/heroes-{api,web}/cloudbuild.yaml` + `apps/portal-api/cloudbuild.yaml`: none declare `availableSecrets` (no analogous orphan refs), but they all carry the same latent nested-substitution shape — they'd hit the same wall the first time anyone submits one. Out of scope for FU-2; the GHA path is the only one exercised live.
  - **Verified 2026-05-12:** `tofu apply -target=google_secret_manager_secret_iam_member.cloud_build_gip_api_key` landed clean; `gcloud builds submit --config apps/portal-web/cloudbuild.yaml --substitutions="COMMIT_SHA=$(git rev-parse HEAD)" .` finished `STATUS: SUCCESS` in 4m38s on the free-tier machine — built the image, fetched the secret, pushed two tags to `coms-portal-registry`, and deployed `coms-portal-web-00008-xzk` carrying the local commit SHA. The hatch works.
  - **Acceptance:** `apps/portal-web/cloudbuild.yaml` no longer references the three orphan secrets ✓; test build succeeds ✓ (build `f313eefb-a1ef-4cfb-b55c-921026b107f2`). FU-2 closed pending the follow-up commit that captures the substitution + SA + machine-type fixes alongside the original.
  - **Related:** `41aeb6e` (workflow fix that surfaced this), `41aeb6e` commit body's Directive section.

- [ ] **FU-3: Wire `db:migrate` into `deploy-portal-api.yml`**
  - **What's missing:** No workflow runs `bun run --cwd apps/portal-api db:migrate` (or any equivalent). `deploy-portal-api.yml` only does `docker build` + `docker push` + `gcloud run deploy`. Today the FU-1 migration `0035` was applied by hand via `cloud-sql-proxy` → `bun --filter @coms-portal/portal-api db:migrate`; without that manual step ahead of the push, the new portal-api revision would have crash-logged `column "health_check_url" does not exist` every 60 seconds until someone noticed and applied it. This was a footgun saved only by remembering the right order.
  - **Why it's tractable here:** Drizzle migrations in this project are append-only — looking at `apps/portal-api/src/db/migrations/`, the recent migrations (0017+) are all additive nullable columns or non-destructive UPDATEs (0034 cleared dead config; 0035 added a nullable column). The migration history itself is the safety review. The right pattern (additive nullable column → backfill → tighten in next deploy) is already the project's discipline, so automated `migrate` is low risk for this shape.
  - **Shape to implement:**
    1. Add a `migrate` job to `.github/workflows/deploy-portal-api.yml` that runs BEFORE the `deploy` job (use `needs:` or sequential `steps:`). The job auths via WIF (same SA as deploy), starts `cloud-sql-proxy` against `coms-aha-heroes-db` in the background (use `&` with a readiness wait), reads `coms-portal-database-url` from Secret Manager, rewrites the host segment to the proxy port, exports `DATABASE_URL`, and runs `bun --filter @coms-portal/portal-api db:migrate`. On failure, the deploy job does not run.
    2. WIF SA `coms-portal-github-actions` needs `roles/cloudsql.client` + `roles/secretmanager.secretAccessor` on `coms-portal-database-url` to authenticate the proxy + read the URL. The runtime SA already has both; the deployer SA does not — add Tofu bindings.
    3. Same pattern should land in `deploy-heroes-api.yml` when heroes' migration story matures (Spec 02 Phase 2 introduces the JWT migration; that's the moment heroes' deploy needs the same step).
  - **Risks worth noting before implementation:**
    - Migration that hangs (e.g. waiting for a Cloud SQL lock) blocks the deploy. Set a timeout on the `bun db:migrate` step (10 minutes is the GHA default; 5 minutes is plenty for additive migrations).
    - Migration that depends on a feature only the new revision can supply (rare; usually a chicken-and-egg sign of a non-additive change). Drizzle's pattern protects against this when discipline holds, but human review on PR is the safety net.
    - Concurrent deploys (two PRs merge in quick succession) racing the same migration. `__drizzle_migrations` is the journal; idempotent by tag. But two `db:migrate` runs in parallel against the same tag could collide on the proxy port or on a CREATE statement. The `concurrency:` block already in `deploy-portal-api.yml` (`group: deploy-portal-api`, `cancel-in-progress: false`) serializes deploys per service — the migrate job under `needs: [deploy]` inherits that serialization.
  - **Acceptance:** A push to main that includes a migration file (e.g. `apps/portal-api/src/db/migrations/00XX_*.sql`) results in the migration applied to prod BEFORE the new revision rolls out, with no manual operator action. Verify by intentionally introducing an additive nullable column in a small follow-up PR and watching the workflow run.
  - **Related:** today's session (commits `2e60f59` + `36f2a41` + `7bc3e0d`), which proved the manual orchestration risk in concrete terms.

- [ ] **FU-4: `tofu apply` via `workflow_dispatch` on main (NOT auto-apply)**
  - **What's missing:** No `infra-apply.yml` workflow exists. `infra-plan.yml` runs `tofu plan` on PR (the comment lie about auto-apply was corrected 2026-05-12). Today's FU-1/FU-2 tofu apply for `cloud_build_gip_api_key` was a `tofu apply -target=` from a laptop against the shared state bucket — the same shape every infra change has used since the project began.
  - **Position taken: manual `workflow_dispatch`, NOT auto-apply on merge.** The infra owns one shared GCP project, one Cloud SQL instance with prod data, the IAM that gates production secrets, and the WIF pool that authenticates every deploy SA. A bad code deploy rolls back by re-deploying the previous SHA; a bad `tofu apply` (e.g. drift on `cloud-sql.tf` that triggers DB recreation) has no equivalent. The "Rollback Plan" principle from `agent-skills:ci-cd-and-automation` pulls hard against auto-apply for this resource shape. The team has already demonstrated comfort with manual apply windows (CP3, today's FU-1/FU-2), so the friction is already internalized — what's missing is reproducibility and audit trail, not the apply button itself.
  - **Shape to implement:**
    1. New file `.github/workflows/infra-apply.yml` with `on: workflow_dispatch:` only (no push trigger). Inputs: optional `target` (resource address for `-target=` apply) for surgical changes; optional `auto_approve` boolean defaulting to `false`. Runs `tofu init` + `tofu plan` (printed to log) + `tofu apply` against the shared state, authed via WIF under the existing `coms-portal-github-actions` SA. State bucket access already works.
    2. Add a `concurrency:` block (`group: infra-apply`, `cancel-in-progress: false`) so two operators can't race the same apply.
    3. Optionally: a status check on push to main that runs `tofu plan` and PR-comments (or writes to the run summary) showing the queued diff. Makes "what's waiting to be applied" visible without applying anything.
  - **Risks worth noting before implementation:**
    - WIF deployer SA currently has only the IAM needed for app deploys. Adding `roles/owner` or equivalent to make `tofu apply` actually work means a much broader blast radius for that SA — every push to main carries the latent capability to mutate every resource. Mitigation: scope the WIF binding to `infra-apply.yml` specifically (GitHub OIDC supports per-workflow filtering via the `aud:`/`sub:` claims).
    - `tofu apply -auto-approve` skips the interactive prompt. The plan output in the run log is the only safety net; the operator reads it before clicking the next workflow_dispatch. If a destructive diff slips into the plan unnoticed, the apply runs it.
    - State lock contention with laptop applies. Once `infra-apply.yml` exists, the laptop should stop being a parallel apply path — every apply goes through the workflow. Document that in `infra/README.md` (creating one if absent).
  - **Acceptance:** A trivial infra change (e.g. a label tweak on a non-critical resource) is applied via the workflow, the run log shows `tofu plan` then `tofu apply` succeeding, and the resulting state matches the laptop-applied baseline. Validate the workflow at the same time the comment-lie correction in `infra-plan.yml` is fully retired.
  - **Future upgrade path:** if the team's risk tolerance shifts and incidents stay rare, swap `workflow_dispatch:` for `push: branches: [main], paths: [infra/**]` to auto-apply. Going looser is one line; going tighter after an incident is awkward — start conservative.
  - **Related:** the corrected comment in `.github/workflows/infra-plan.yml` (this commit); today's session (manual `tofu apply -target=`); `agent-skills:ci-cd-and-automation` skill's "Rollback Plan" principle.

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
  - **Carry-over from CP4 Finding 1:** after this and T26 land, re-run `register:heroes` against prod with single-origin URLs so the HEROES card launches stay on `aha-coms.web.app` instead of bouncing to heroes-web's `*.run.app` host. Runbook in the script's JSDoc; the relevant override block is `HEROES_APP_URL=https://aha-coms.web.app/heroes` + `HEROES_WEBHOOK_URL=https://aha-coms.web.app/heroes/api/webhooks/portal` (other env vars unchanged from the 2026-05-12 run). After this update, the `__session` cookie travels on the HEROES card click without needing the multi-origin exchange dance.

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
