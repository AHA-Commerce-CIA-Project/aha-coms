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

- [ ] **T08: Convert `apps/api` git URL deps → `workspace:*`; resolve SDK 0.1.1 → current gap**
  - **Prerequisites:** T01, T02, T03 (libs available for `workspace:*` resolution)
  - **Spec ref:** Spec 01 Phase 1 Step 4 + Risk #1 in plan.md.
  - **Steps:**
    - Update `apps/api/package.json`: all `@coms-portal/*` deps → `workspace:*`.
    - Bump from SDK `v0.1.1` to current (workspace:* will pull current).
    - **Surface and resolve any breakage** — the gap likely hides a breaking change in the issuer-side SDK contract.
  - **Acceptance:** `apps/api/package.json` has no `git+https://` URLs; build succeeds against current SDK.
  - **Verification:** `bun --filter @coms-portal/api build` succeeds; existing tests pass.

- [ ] **T09: Convert `apps/web` git URL deps → `workspace:*`**
  - **Prerequisites:** T01–T05 (all libs in tree)
  - **Acceptance:** `apps/web/package.json` has no `git+https://` URLs.
  - **Verification:** `bun --filter @coms-portal/web build` succeeds.

- [ ] **CHECKPOINT 1**: `bun install --frozen-lockfile` at monorepo root + `bun run typecheck` across all packages + portal-api builds + portal-web builds + all existing tests pass.

### Phase 2: Rename (already complete)

- [x] **Renamed `coms_portal` → `aha-coms`** (completed in the planning session)

### Phase 3: Heroes into the monorepo

Spec ref: `docs/spec/01-monorepo-consolidation.md#phase-3`.

- [ ] **T10: Coordinate heroes freeze window with heroes' eng**
  - **Prerequisites:** Checkpoint 1
  - **Acceptance:** Heroes' eng has acknowledged a 1–2 day no-merge window for T11–T15.
  - **Verification:** Confirmation in writing (Slack, comment, whatever channel applies).
  - **Note:** Do not start T11 until this is `[x]`.

- [ ] **T11: Subtree-merge `coms_aha_heroes` → `apps/heroes-temp/`**
  - **Prerequisites:** T10
  - **Steps:** Use `git subtree add` to bring the whole repo in, preserving history.
  - **Acceptance:** `apps/heroes-temp/packages/{server,web,shared}/` exists in monorepo.

- [ ] **T12: Restructure heroes into final layout**
  - **Prerequisites:** T11
  - **Steps:**
    - `apps/heroes-temp/packages/server` → `apps/heroes-api/`
    - `apps/heroes-temp/packages/web` → `apps/heroes-web/`
    - `apps/heroes-temp/packages/shared` → `packages/heroes-shared/`
    - Move heroes' `infra/` to per-service location (`apps/heroes-api/infra/`, `apps/heroes-web/infra/`) OR keep as single `apps/heroes/infra/` — coordinate with current heroes infra ownership.
    - Delete `apps/heroes-temp/`.
  - **Acceptance:** Final layout matches the structure described in Spec 01 Phase 3 + integration contract §8.
  - **Verification:** Directory layout verified by `find apps/heroes-* packages/heroes-shared -maxdepth 2 -type d`.

- [ ] **T13: Rename heroes' internal namespace `@coms/*` → `@coms-portal/heroes-*`**
  - **Prerequisites:** T12
  - **Steps:**
    - `@coms/shared` → `@coms-portal/heroes-shared`
    - `@coms/server` → `@coms-portal/heroes-api`
    - `@coms/web` → `@coms-portal/heroes-web`
    - Update all import statements across heroes packages.
  - **Acceptance:** Grep returns no `@coms/` imports in `apps/heroes-*` or `packages/heroes-shared`.
  - **Verification:** `bun --filter "@coms-portal/heroes-*" typecheck` passes.

- [ ] **T14: Convert heroes' git URL deps → `workspace:*`**
  - **Prerequisites:** T13
  - **Steps:** Update package.jsons in heroes-api, heroes-web, heroes-shared.
    - `@coms-portal/sdk@git+...#v1.2.0` → `workspace:*`
    - Similarly for ui-svelte (formerly ui), design-tokens, account-widget-svelte.
  - **Acceptance:** No `git+https://` URLs in heroes package.jsons.
  - **Verification:** Heroes-api and heroes-web build via `bun --filter "@coms-portal/heroes-*" build`.

- [ ] **T15: Verify heroes SSO end-to-end against in-tree SDK**
  - **Prerequisites:** T14
  - **Steps:**
    - Run heroes-api and heroes-web locally.
    - Sign in via portal handoff.
    - Access a protected route in heroes.
  - **Acceptance:** Login flow completes; user session works in heroes.
  - **Verification:** Manual E2E pass (or scripted if a test suite covers it).

- [ ] **CHECKPOINT 2**: Heroes builds in-tree + SSO works end-to-end.

### Phase 4: Per-service path-filtered Cloud Build

Spec ref: `docs/spec/01-monorepo-consolidation.md#phase-4`. Also see integration contract §8.

- [ ] **T16: Update each `apps/<service>/cloudbuild.yaml` for monorepo-root install**
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

- [ ] **T17: Update Cloud Build triggers with `includedFiles` filters**
  - **Prerequisites:** T16
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
