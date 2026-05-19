# Spec 01: Monorepo Consolidation

> Status: **sealed 2026-05-12 (CP5 crossed).** All six phases executed; the polyrepo of seven git remotes is now a single Bun workspace at `aha-coms/`. This document is preserved as the historical execution record; consult `tasks/todo.md` for the per-task seal notes and `tasks/plan.md` for cross-spec context.
> Type: one-shot (executable plan; document dies once executed)
> Owner: TBD
> Targets: ADR 0001, integration contract §§ 1–13

## What shipped vs. what this spec proposed

The spec body below reflects the plan as authored. Three structural details diverged during execution and are recorded here so the body reads honestly:

1. **`infra/` lives at the monorepo root**, not nested under each app (`apps/<app>/infra/`). Per the standing principle "per-app resources by default" (see `tasks/plan.md`), the layout is `infra/{heroes,portal,fast}/` with each subdirectory carrying its own Tofu state. The Phase 3 example showing `apps/heroes/infra/` was superseded.
2. **Deploys run through GitHub Actions**, not Cloud Build. Each service has a `.github/workflows/deploy-<service>.yml` with path filters + WIF auth. Phase 4's "Cloud Build" wording is the original proposal; the executed shape is GHA. The path-filter discipline the phase prescribed survived intact.
3. **The Firebase Hosting site is named `aha-coms`** (not `aha-coms-staging`) and carries **four rewrites**, not three — `/heroes/api/**` precedes `/heroes/**`, `/api/**` precedes the catch-all. The trailing `-staging` suffix was dropped at T18 because there is no separate staging tier: all four Cloud Run services run as `environment = "prod"` and the routing layer fronts prod directly.

## Objective

Consolidate the COMS suite — 3 apps and 5 shared libraries currently in 8 separate git repos — into a single Bun workspace monorepo at `aha-coms/`. By end of this spec, every line of code that belongs to the suite lives in one tree, with `workspace:*` resolving all in-tree dependencies, and per-app deploys preserved via path-filtered Cloud Build triggers.

This spec covers **structural consolidation only.** Heroes integration cleanup is Spec 02. aha-fast onboarding is a future spec written when aha-fast is ready.

## Success criteria

This spec is done when all of the following are true:

- [ ] `aha-coms/` contains every line of code currently in `coms_portal`, `coms-sdk`, `coms-shared`, `coms-ui`, `coms-design-tokens`, `coms-account-widget`, and `coms_aha_heroes`.
- [ ] The 5 lib repos and the 2 app repos are archived on GitHub (read-only, not deleted).
- [ ] `bun install` at the monorepo root completes successfully and produces a working tree where every app builds.
- [ ] Every `git+https://github.com/...` dependency entry across all in-tree packages is replaced with `workspace:*`.
- [ ] Each app deploys independently via its own path-filtered Cloud Build trigger.
- [ ] portal-web is reachable in staging at a Firebase Hosting URL.
- [ ] Heroes-server's authentication (verifying portal-minted sessions) still works end-to-end against the moved code, with no functional regression.
- [ ] aha-fast is **not** moved in this spec (it stays a separate repo; movement is its own spec).
- [ ] The `coms_portal/apps/api` SDK gap (`@coms-portal/sdk@v0.1.1` while current is `1.3.0`) is resolved as part of the move — apps/api is on workspace:* and compiles against the current SDK.

## Out of scope

- Heroes integration cleanup (Spec 02).
- aha-fast onboarding to the monorepo (future spec).
- React UI library variants (`@coms-portal/ui-react`, `@coms-portal/account-widget-react`). They're stubbed in the structure but populated later, as aha-fast onboarding needs them.
- Firebase Hosting cutover for the production domain. Staging hostname only in this spec.
- The auth migration for aha-fast (ADR 0006).

## Tech stack baselines

- **Package manager / workspace tool**: Bun (suite-wide). **Runtime: per-app** per [ADR 0009](../adr/0009-bun-for-package-management.md) — Bun for Elysia and SvelteKit apps, Node.js for Next.js apps.
- **Languages**: TypeScript across the board.
- **Apps**: SvelteKit (portal-web, heroes-web), Elysia on Bun (portal-api, heroes-api). Next.js on Node (fast — not in scope for this spec).
- **ORM**: Drizzle ([ADR 0008](../adr/0008-drizzle-as-default-orm.md)). aha-fast on Prisma (documented exception, separate migration).
- **Database**: Cloud SQL Postgres (per-app instances or shared instance with per-app databases — heroes and portal can keep current arrangement).
- **IaC**: OpenTofu (`tofu` CLI), per-app state.
- **Deploys**: per-app Cloud Run service, per-app `cloudbuild.yaml`.

## Project structure (target)

```
aha-coms/
  apps/
    portal-api/                  ← from coms_portal/apps/api
    portal-web/                  ← from coms_portal/apps/web
    heroes-api/               ← from coms_aha_heroes/packages/server
    heroes-web/                  ← from coms_aha_heroes/packages/web
  packages/
    sdk/                         ← from coms-sdk
    shared/                      ← from coms-shared
    ui-svelte/                   ← from coms-ui (renamed)
    ui-react/                    ← new empty stub
    design-tokens/               ← from coms-design-tokens
    account-widget-svelte/       ← from coms-account-widget (renamed)
    account-widget-react/        ← new empty stub
    heroes-shared/               ← from coms_aha_heroes/packages/shared (renamed from @coms/shared)
  infra/
    shared/                      ← optional: VPC, Artifact Registry, project-level resources
  docs/                          ← this directory
  firebase.json                  ← Firebase Hosting rewrites (added in §6)
  package.json                   ← root workspace manifest
  bun.lock                       ← single lockfile
  bunfig.toml
```

## Commands

After consolidation, the canonical commands at the monorepo root:

```bash
# install
bun install --frozen-lockfile

# dev (all apps in parallel)
bun run dev

# dev (single app)
bun run dev:portal-web
bun run dev:heroes-api
# ...etc

# build (all)
bun run build

# typecheck (all)
bun run typecheck

# test (all)
bun run test

# migrate the portal DB
bun run db:migrate --filter @coms-portal/portal-api

# migrate the heroes DB
bun run db:migrate --filter @coms-portal/heroes-api
```

## Order of operations

The work is sequenced to minimize risk and produce a verifiable working tree at each step. Don't reorder without justification.

### Phase 1: Move shared libraries into portal's existing workspace

Portal is already a Bun workspace with `apps/api` and `apps/web`. The 5 libs move in first as `packages/*`. This validates the workspace expansion before any app migration.

1. **Subtree-merge each lib into `coms_portal/packages/<name>`**, preserving history:
   ```
   coms-sdk             → packages/sdk/
   coms-shared          → packages/shared/
   coms-ui              → packages/ui-svelte/      (renamed package: @coms-portal/ui-svelte)
   coms-design-tokens   → packages/design-tokens/
   coms-account-widget  → packages/account-widget-svelte/  (renamed: @coms-portal/account-widget-svelte)
   ```
2. **Update root `package.json`**: `workspaces: ["apps/*", "packages/*"]`.
3. **Convert intra-tree git-URL dependencies to `workspace:*`** in:
   - `packages/sdk` (depends on shared)
   - `apps/api` (depends on sdk, shared)
   - `apps/web` (depends on sdk, shared, ui-svelte, design-tokens, account-widget-svelte)
4. **Resolve the `apps/api` SDK version gap.** Currently pinned at `@coms-portal/sdk@v0.1.1`; bring it to current. This will surface whatever divergence exists between issuer-side (portal-api) and verifier-side (heroes-api) SDK code. Plan for breakage to surface here.
5. **Stub empty packages**: `packages/ui-react/` and `packages/account-widget-react/` get scaffolding `package.json` files declaring `@coms-portal/ui-react@0.0.0` and `@coms-portal/account-widget-react@0.0.0` with empty `src/index.ts`. They're populated later.
6. **Run `bun install` and verify** both portal-api and portal-web build, typecheck, and pass existing tests.

**Checkpoint:** Portal is a 7-package workspace. Apps build. Tests pass.

### Phase 2: Rename the consolidated tree to `aha-coms`

7. **Rename the directory and the GitHub repo**:
   ```bash
   mv coms_portal aha-coms      # on disk
   gh repo rename aha-coms      # GitHub
   ```
8. **Update internal references** to the directory name (any docs, scripts, README anchors).
9. **NPM package names stay `@coms-portal/*`.** The npm namespace is decoupled from the repo name; renaming hundreds of import statements is high-churn for low value.

**Checkpoint:** The monorepo is `aha-coms/`. Everything still builds.

### Phase 3: Move heroes into the monorepo

10. **Subtree-merge `coms_aha_heroes` into `aha-coms/apps/heroes-temp/`**. This is an intermediate location; we'll restructure inside it.
11. **Restructure**:
    - `apps/heroes-temp/packages/server` → `apps/heroes-api/`
    - `apps/heroes-temp/packages/web` → `apps/heroes-web/`
    - `apps/heroes-temp/packages/shared` → `packages/heroes-shared/`
    - `apps/heroes-temp/infra` → `apps/heroes/infra/` (combined or split per-service — coordinate with heroes' deploy story)
    - Delete the now-empty `apps/heroes-temp/`.
12. **Rename heroes' internal package namespace**: `@coms/shared` → `@coms-portal/heroes-shared`, `@coms/server` → `@coms-portal/heroes-api`, `@coms/web` → `@coms-portal/heroes-web`. (This is namespace reconciliation, see ADR 0001.)
13. **Convert heroes' git-URL deps to `workspace:*`** in heroes-api, heroes-web, heroes-shared.
14. **Run `bun install` and verify** heroes-api and heroes-web build, typecheck, and pass existing tests.
15. **Verify SSO end-to-end**: heroes-web → portal-api auth handoff still works against the in-tree SDK. This is the integration smoke test.

**Checkpoint:** Suite is in one tree. 4 apps, 8 packages. Heroes' SSO works.

### Phase 4: Per-app deploys via path-filtered Cloud Build

16. **Each `apps/<app>/cloudbuild.yaml`** is updated to:
    - Install from the monorepo root: `bun install --frozen-lockfile` runs at the top.
    - Build the app-specific bundle: `bun --filter @coms-portal/<app>-web build` or equivalent.
    - Build the Docker image and deploy to the existing per-app Cloud Run service.
17. **Cloud Build triggers** are updated/created to filter by path:
    - portal-web trigger: `includedFiles: ['apps/portal-web/**', 'packages/**', 'package.json', 'bun.lock']`
    - portal-api trigger: `includedFiles: ['apps/portal-api/**', 'packages/**', 'package.json', 'bun.lock']`
    - heroes-api trigger: `includedFiles: ['apps/heroes-api/**', 'packages/heroes-shared/**', 'packages/**', 'package.json', 'bun.lock']`
    - heroes-web trigger: similar.
18. **Verify each app deploys independently** by pushing a small change that touches only that app's source.

**Checkpoint:** Each app deploys without triggering rebuilds of other apps. Lib changes trigger every dependent app.

### Phase 5: Firebase Hosting staging setup

19. **Create `firebase.json` at monorepo root** with rewrites:
    ```jsonc
    {
      "hosting": {
        "site": "aha-coms-staging",
        "rewrites": [
          { "source": "/heroes/**", "run": { "serviceId": "heroes-web", "region": "<region>" } },
          { "source": "/api/**", "run": { "serviceId": "portal-api", "region": "<region>" } },
          { "source": "**", "run": { "serviceId": "portal-web", "region": "<region>" } }
        ]
      }
    }
    ```
20. **Deploy to Firebase Hosting staging**: `firebase deploy --only hosting`.
21. **Verify routing** at the Firebase-provided URL (`<project-id>.web.app` or staging site URL):
    - `/heroes/dashboard` reaches heroes-web.
    - `/api/health` reaches portal-api.
    - `/login` reaches portal-web.
    - The `coms_session` cookie set by portal-web is visible to heroes-web requests.

**Checkpoint:** Single-origin routing works in staging. Apps don't have base-path config yet (heroes' web still expects to be served at `/`); base-path migration is part of Spec 02.

### Phase 6: Archive

22. **Archive the GitHub repos** for `coms-sdk`, `coms-shared`, `coms-ui`, `coms-design-tokens`, `coms-account-widget`, `coms_aha_heroes`. Read-only, not deleted.
23. **Update repository.url** in each in-tree package's `package.json` to point at the new monorepo URL.

**Checkpoint:** Consolidation complete.

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| SDK version gap (apps/api on 0.1.1 vs current 1.3.0) hides breaking changes | High | Surface in Phase 1 step 4. Reserve time for porting whatever diverged between issuer-side and verifier-side code. |
| `bun install` fails on aha-fast's native deps (sharp, lightningcss) — but aha-fast is out of scope, ignore | Low | aha-fast not in this spec. |
| Heroes' internal `@coms/*` import statements break after rename | Medium | Phase 3 step 12 is a coordinated rename: rebuild, fix all imports, commit as one PR. |
| Firebase Hosting cookie passthrough doesn't work the way docs suggest | Low | Verify with the half-day spike from earlier conversation (single-app behind hosting, cookie behavior end-to-end). Mitigation: routing Cloud Run service as fallback. |
| Subtree merges produce ugly history if not run correctly | Medium | Use `git subtree add --prefix=packages/sdk coms-sdk-remote main`. Test the procedure on one lib before doing all five. |
| In-flight work on heroes during the move blocks merge | High | Coordinate a heroes freeze window (1-2 days). Heroes' current eng signs off. |
| In-flight work on aha-fast continues (it's out of scope) | N/A | aha-fast moves later. |

## Verification

After each phase's checkpoint, the following pass:

- `bun install` at monorepo root completes with no errors.
- `bun run typecheck` passes for all in-tree packages.
- `bun run test` passes for all packages with tests.
- For Phase 1: portal-web and portal-api build via existing scripts.
- For Phase 3: heroes-web and heroes-api build; heroes' SSO end-to-end test passes.
- For Phase 4: a PR touching only `apps/portal-web/src/**` triggers only portal-web's Cloud Build; a PR touching `packages/sdk/**` triggers all dependent apps' Cloud Builds.
- For Phase 5: `curl https://<staging-url>/heroes/healthz` returns heroes-web's health response.

## Open questions

- Who owns the Firebase Hosting staging project? Probably portal's existing GCP project; needs confirmation.
- What's the heroes freeze window? Coordinate with heroes' eng.
- Should `infra/shared/` exist now (with VPC, Artifact Registry, etc. pulled out of per-app stacks), or defer until a third app needs it? Lean defer.

## Out of band: housekeeping

After Phase 6:

- Memory directory rename for Claude Code (cosmetic, not blocking).
- Local clone cleanup on each engineer's machine.
- Cancellation of any per-lib-repo CI subscriptions if applicable.
