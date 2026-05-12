# Execution Plan: Monorepo Consolidation + Heroes Cleanup

> Last updated: 2026-05-12 (after T17 — GHA workflows + GitHub repo rename mrdoorba/coms-portal → mrdoorba/aha-coms)
> Status: Phase 1 sealed at `34fbedd`; Phase 3 sealed and Checkpoint 2 crossed at `33593a9`; T16 lands the portal split + per-service Cloud Build scaffolding at `5935d00`; T16.5 splits `infra/heroes/` into `coms-heroes-api` + `coms-heroes-web` with their own least-priv runtime SAs at `de68b28`; the per-app-resources + per-app naming principles in this file are the standing rules going forward (heroes images now route to heroes' own `coms-heroes-repo`); T17 returned deploys to GitHub Actions per the new "CI/CD via GHA while public" principle — four `.github/workflows/deploy-*.yml`, heroes' WIF renamed `coms-heroes-{wif-pool,deployer-sa}` and re-pointed at `mrdoorba/aha-coms`. Next: Checkpoint 3 (per-service deploys verified independent — operator runs the tofu apply for T16.5 + T17 + opens four no-op test PRs to confirm path filters), then Phase 5 (Firebase Hosting staging). Findings 1 + 2 from T15 are closed in T16.
> Source specs: `docs/spec/01-monorepo-consolidation.md`, `docs/spec/02-heroes-cleanup.md`

## Goal

Move the COMS suite from the current polyrepo state (5 external lib repos + 2 external app repos + portal as the consolidation host) to a single Bun workspace monorepo at `aha-coms/`, with heroes cleaned up to be the reference implementation for the integration contract.

Total scope: 12 phases (Spec 01: 6 phases, Spec 02: 6 phases) broken into 49 vertically-sliced tasks in `tasks/todo.md`, with 11 hard checkpoints between phases.

## Inputs (read first in any fresh session)

In order:

1. `docs/integration-contract.md` — the rules every service must satisfy. The destination state.
2. `docs/spec/01-monorepo-consolidation.md` — the structural move.
3. `docs/spec/02-heroes-cleanup.md` — the heroes alignment.
4. `docs/adr/0001..0010` — the why behind load-bearing decisions; reference as needed for each task.
5. This file (`tasks/plan.md`) and `tasks/todo.md`.

## Current state (as of CP1 + T10 commit `9426307`)

**On disk** (in `~/HT/AHA COMS/`):

- `aha-coms/` — Bun workspace with `apps/{api,web}` and `packages/{shared,design-tokens,sdk,ui-svelte,account-widget-svelte,ui-react,account-widget-react}`. The consolidation host with seven packages now resolved through `workspace:*`.
- `aha-fast/` — Next.js project management tool, npm-based, separate repo. **Not in Spec 01 scope.** Onboarding is a future spec (post-Spec 02).
- `coms_aha_heroes/` — SvelteKit + Elysia, Bun workspace, separate repo. Still external; T11 begins the subtree-merge.
- `coms-{sdk,shared,ui,design-tokens,account-widget}/` — five external lib repos, **subtree-merged in-tree** but **not yet archived on GitHub** (Phase 6 / T21).

**Already complete:**

- Phase 2: renamed `coms_portal` → `aha-coms` (doc set v1, commit `981ae02`).
- Phase 1: all five lib subtree-merges + two React stubs + apps/{api,web} workspace flip + SDK gap closure + SDK example-test fix. Crossed Checkpoint 1 at `48649c5`, healed in `34fbedd`.
- T10: heroes freeze window — sole maintainer; freeze trivially in effect (`9426307`).

**Not started:**

- Spec 01 Phases 3, 4, 5, 6 — T11 is next (subtree-merge `coms_aha_heroes`).
- All of Spec 02.

**Known pre-T11 caveat:** three non-main remote branches exist on `coms_aha_heroes` (`ci/parallelize-and-harden`, `ci/skip-redundant-build-and-docker-parallel`, `rev3/spec-01-02-adoption`). User confirmed 2026-05-11 they hold no work that needs preserving; `git subtree add ../coms_aha_heroes main` will not pull them and they will be archived alongside the repo at T22.

## Dependency graph (Spec 01 → Spec 02)

```
Spec 01 Phase 1: libs into aha-coms
   subtree shared (no deps)              ┐
   subtree design-tokens (no deps)       │ — can be parallel
   subtree ui-svelte (consumes tokens)   │
   subtree account-widget-svelte         │
   subtree sdk (depends on shared)       │ — must follow shared
   stub ui-react (empty)                 │
   stub account-widget-react (empty)     │
   convert apps/{api,web} git URLs → workspace:*
   resolve apps/api SDK gap (0.1.1 → current)
        ↓
   CHECKPOINT 1: portal-api + portal-web build green
        ↓
Spec 01 Phase 3: heroes into aha-coms (after freeze with heroes' eng)
   subtree coms_aha_heroes → temp location
   restructure → apps/heroes-api + apps/heroes-web + packages/heroes-shared
   rename @coms/* → @coms-portal/heroes-*
   convert heroes' git URLs → workspace:*
   verify SSO end-to-end
        ↓
   CHECKPOINT 2: heroes builds + SSO works
        ↓
Spec 01 Phase 4: per-service path-filtered Cloud Build
   each apps/<service>/cloudbuild.yaml → installs from monorepo root
   Cloud Build triggers updated with includedFiles filters
   verify single-app PRs trigger only that app's build
        ↓
   CHECKPOINT 3: per-service deploys verified independent
        ↓
Spec 01 Phase 5: Firebase Hosting staging
   firebase.json with /heroes/**, /api/**, /** rewrites
   deploy to staging
   verify cross-app cookie sharing
        ↓
   CHECKPOINT 4: single-origin routing works in staging
        ↓
Spec 01 Phase 6: archive external repos
   GitHub-archive 5 lib repos + coms_aha_heroes
   update repository.url in in-tree package.jsons
        ↓
   CHECKPOINT 5: Spec 01 complete
        ↓
Spec 02 Phase 1: heroes single-origin migration
   kit.paths.base: '/heroes' in heroes-web
   audit internal links for base-path compliance
   heroes-api Elysia router → /heroes/api prefix
   heroes-web eden client config updated
   Firebase Hosting rewrites updated for /heroes/api/**
   layout: ServiceBar derives from APP_LAUNCHER; drop portalOrigin
        ↓
   CHECKPOINT 6: heroes lives at /heroes/* same-origin
        ↓
Spec 02 Phase 2: heroes JWT sessions
   confirm SDK JWT payload contract; update SDK if needed (do this FIRST)
   write loadHeroesAuthUser() in packages/heroes-shared
   replace hooks.server.ts + middleware/auth.ts with JWT path
   remove getLocalSessionByToken family from session.ts
   migrate: drop session/account/verification tables
   verify auth E2E
        ↓
   CHECKPOINT 7: heroes has no local session tables
        ↓
Spec 02 Phase 3: portal handoff for first-login
   audit /auth/portal/exchange role
   refactor or delete (no DB write, no session mint)
        ↓
   CHECKPOINT 8: no app-local session minting
        ↓
Spec 02 Phase 4: chrome lib glue absorption
   serviceBarServices derivation → chrome lib
   theme narrowing → chrome lib
   icon type cast removed (version-skew gone)
   decide: slide-over admin menu local vs generalize
        ↓
   CHECKPOINT 9: heroes layout file shrinks meaningfully
        ↓
Spec 02 Phase 5: cache evaluation
   map email_cache + userConfigCache fields → JWT / keep cached / migrate
   migrate JWT-eligible data into JWT claims
   reduce per-request 3-table JOIN to 1
   keep webhook events table
        ↓
   CHECKPOINT 10: auth-path query reduced
        ↓
Spec 02 Phase 6: verification + docs
   E2E smoke test
   performance check (p50/p95 flat or faster)
   update heroes' README to point at integration contract
        ↓
   CHECKPOINT 11: heroes is the reference implementation
```

## Vertical slicing approach

Each task in `tasks/todo.md` is sliced **vertically** — it delivers a complete working state, not a partial step. Specifically:

- A "subtree-merge a lib" task includes the subtree + workspace registration + dependency conversion + verification, end-to-end, in one task. Not "step 1 of N."
- A "JWT replacement" task includes the new function + replacing all consumers + the drop migration + verification, all the way to "heroes auths via JWT and has no session table."

**Anti-pattern:** Don't split horizontally ("do all subtree merges first, then convert all dependencies, then verify"). Horizontal slicing creates broken intermediate states where the working tree doesn't compile.

## Checkpoints

Each `CHECKPOINT N` in the graph is a **hard gate**. Before crossing:

- `bun install --frozen-lockfile` at the monorepo root must succeed.
- `bun run typecheck` (or per-package equivalent) must pass for affected packages.
- `bun run test` must pass for packages with tests.
- Any checkpoint-specific verification listed in `todo.md` must succeed.

**If a checkpoint fails: stop. Fix. Re-verify. Don't proceed past red.**

A failed checkpoint usually means the previous phase wasn't truly vertically sliced — go back and finish it before moving on.

## Session-handoff protocol

When a fresh Claude session picks up this plan:

1. Read `tasks/plan.md` (this file) and `tasks/todo.md`.
2. Find the next unchecked task in `todo.md`.
3. Read the relevant Spec section in `docs/spec/` for full context.
4. Read relevant ADRs (the task description will reference them).
5. Mark the task `[~]` (in progress) before starting.
6. Execute the task and run its verification.
7. Mark the task `[x]` (complete) when verified — never on intent alone.
8. Commit status changes alongside the work (one logical commit per task or related task cluster, Mr. Door voice).
9. If blocked: leave the task `[~]`, append a `Blocker:` line under the task in `todo.md`, surface to the user.

**Both files are git-tracked.** Status updates go in commits.

## Risks worth tracking

| Risk | Phase | Likelihood | Mitigation |
|---|---|---|---|
| SDK `0.1.1` → current gap in `apps/api` hides breaking changes | Phase 1 (T08) | High | Surface immediately. Reserve a half-day for porting whatever diverged between issuer-side and verifier-side SDK code. |
| Heroes' base-path migration breaks scattered absolute links | Phase 1 Spec 02 (T25) | High | Audit `grep -rn 'href="/[a-z]'` thoroughly. Run heroes against base-path-prefixed staging URL before any production cutover. |
| `bun install` quirks on native deps (sharp, lightningcss, Prisma) | Spec 02 onwards (only when aha-fast onboards) | Medium | Deferred. Not a blocker for Spec 01 or Spec 02. |
| Heroes' app-side glue won't fully absorb into chrome lib | Phase 4 Spec 02 (T40-T43) | Medium | Some patterns may stay app-local. Document the judgment calls when they arise. |
| Webhook consumer relied on session staleness | Phase 2 Spec 02 (T36) | Low | Audit `portal_webhook_events` consumers for assumptions about session lifetime before drop-table migration. |
| Heroes freeze window not coordinated | Phase 3 Spec 01 (T10) | Medium | T10 is explicitly a coordination task; do not skip. |
| Firebase Hosting passthrough quirks (cookies, streaming SSR) | Phase 5 Spec 01 (T19-T20) | Medium | Pre-spike with one app behind Firebase Hosting before committing the architecture. |

## Standing principles for IaC across all apps

These predate the current plan and outlive it — every future app onboarding (aha-fast, app 3, app 4) follows the same shape unless an explicit ADR justifies an exception.

1. **Per-app resources by default.** Each app owns its own Cloud Run services, Artifact Registry repo, runtime SAs (one per service), monitoring filters, secrets, and Cloud Build pipelines. Shared resources (Cloud SQL instance, project, VPC, WIF pool) need an explicit reason recorded in an ADR — not a copy-paste from another app's template. The blast radius of a bad change in app A must not reach app B; the migration path of spinning out an app must not require extracting its data from a shared store.
2. **Naming convention: `coms-<app>-<resource>`.** New IaC drops the `aha` infix — heroes' new resources are `coms-heroes-api`, `coms-heroes-web`, `coms-heroes-repo`, `coms-heroes-{api,web}-sa`. Existing `coms-aha-*` names that are operationally costly to rename (GCS buckets holding data, the Tofu state bucket itself, the sheet-sync SA whose email is shared with live Google Sheets) stay as they are; cheap renames (the Artifact Registry repo, dead WIF resources) get aligned as the surrounding work touches them.
3. **App-side Tofu state stays self-contained.** An app's Tofu state should not have a hard dependency on another app's state by data lookup unless the dependency is genuinely cross-cutting (e.g. an org-wide WIF pool). Cross-state lookups bind apply ordering and complicate the spin-out story; prefer duplicating a small constant over linking states.
4. **CI/CD via GitHub Actions while the repo stays public.** `mrdoorba/aha-coms` is a public GitHub repo, which means unlimited free Actions minutes for standard runners. Cloud Build with `E2_HIGHCPU_8` (the machine type the cloudbuild yamls request) has no free tier — every minute is paid. T17 returned all four service deploys to GHA workflows (`deploy-{portal,heroes}-{api,web}.yml`) authenticating to GCP via WIF. Each app keeps its own deployer SA + WIF pool (per-app principle): portal via `coms-portal-github-actions`, heroes via `coms-heroes-deployer-sa`. The cloudbuild yamls in `apps/*/cloudbuild.yaml` remain in the tree as a manual escape hatch — `gcloud builds submit --config apps/<service>/cloudbuild.yaml .` still works for one-off deploys when the workflow is offline. Reconsider this principle if (a) the repo turns private, or (b) an app needs a build path Cloud Build does materially better (custom workers, GCS-private base images, etc.) — in which case record the per-app exception in an ADR.

## What's deliberately not in this plan

- **aha-fast onboarding** (Next.js, currently on npm + Better Auth). Future spec, written after aha-fast freezes its in-flight feature work. Outside Spec 01 and Spec 02.
- **Spec 03 (Integration Test Kit)** — stub exists at `docs/spec/03-integration-test-kit.md`. Picked up after Spec 02 lands.
- **Spec 04 (SDK as Enforcement Layer)** — stub at `docs/spec/04-sdk-as-enforcement-layer.md`. Picked up alongside or after Spec 03.
- **Platform-owned notifications** (the one contract deviation in heroes). Separate future spec.
- **Apps 3 and 4 onboarding.** Future work; the integration contract is the spec they integrate against.

## Confidence in the plan

| Aspect | Confidence | Notes |
|---|---|---|
| Phase ordering | High | Dependency graph reflects real dependencies. |
| Vertical slicing | High | Each task delivers a working state. |
| Acceptance criteria | Medium | Verification steps are specific but may need refinement when actual code is touched. |
| Effort estimates | Not provided | Deliberately. The user will estimate as tasks are picked up. |
| Coordination assumptions | Low | "Heroes freeze window" (T10) assumes a process the plan author doesn't know the shape of. May need adjustment. |

Adjustments to this plan are expected as execution surfaces information. The plan is a living document; update it alongside `todo.md` as decisions evolve.
