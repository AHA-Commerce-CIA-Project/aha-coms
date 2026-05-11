# ADR 0001: Monorepo over polyrepo

Status: accepted (2026-05-11)

## Context

The COMS suite started polyrepo: each app and each shared library lived in its own GitHub repo. As consolidation pressure grew, the coordination tax became visible:

- `coms_portal/apps/api` declared `@coms-portal/sdk@git+...#v0.1.1`. Current SDK was at `1.3.0`.
- `coms_portal/apps/web` and `apps/api` pinned `@coms-portal/shared` at `v1.7.0`; the SDK itself pinned `shared` at `v1.6.0`.
- `coms_aha_heroes` pinned the SDK at `v1.2.0`.

That's three sibling apps disagreeing on which version of the same shared lib they use, with the SDK itself a fourth voice. Every change to a lib required a tag + version-pin bump dance across every consumer, repeated for every lib edited. With three apps and five libs already, the math is 15 dependency edges to keep aligned by hand. Adding aha-fast as a consumer would push it to 20; apps 3 and 4 push it past 30.

The libraries themselves are pre-mature: no established publishing pipeline, no Changesets, no private registry. Setting up that pipeline is real work, and it solves a problem (publish-consume coordination across orgs you don't control) we don't actually have — we control every app.

The unified-UX mandate is a forcing function. Atomic cross-package changes (SDK contract + portal-api issuer + portal-web shell + heroes integration + fast integration all in one PR) are structurally impossible across separate repos. Inside a monorepo they're trivial.

## Decision

Consolidate the COMS suite into a single Bun workspace monorepo at `aha-coms/`. The layout:

```
aha-coms/
  apps/
    portal-api/                  ← Elysia + Bun
    portal-web/                  ← SvelteKit
    heroes-api/               ← Elysia + Bun
    heroes-web/                  ← SvelteKit
    fast/                        ← Next.js
    [app-3, app-4 land here]
  packages/
    sdk/
    shared/
    ui-svelte/
    ui-react/
    design-tokens/
    account-widget-svelte/
    account-widget-react/
    heroes-shared/               ← renamed from heroes' internal @coms/shared
  infra/
    shared/                      ← optional: VPC, registry, top-level project resources
  docs/                          ← this directory (suite-level architecture only)
```

Bun workspaces. `workspace:*` for in-tree dependencies. Per-app `cloudbuild.yaml` and `infra/` preserved inside each app directory. No Turborepo (premature at this scale). No Changesets (no external consumers).

## Consequences

**Positive.**

- Version drift inside the tree is structurally impossible. There is only HEAD.
- Atomic cross-package changes: SDK contract + portal issuer + every consumer in one PR.
- New app onboarding is `mkdir apps/<app>/`. No registry setup, no `.npmrc`, no version pinning.
- The shared chrome and account widget evolve with portal in lockstep. Drift-induced UX inconsistency disappears as a category.
- One install state means one source of truth for the entire suite's dependency tree.

**Negative.**

- aha-fast migrates from npm to Bun. Bun handles Next.js installs cleanly but the engineer pays a one-time learning cost.
- CI must use path-filtered builds from day one. Naive "rebuild everything on every PR" is unusable at 4+ apps. Real CI configuration work.
- Cross-coupling temptation is higher: it becomes easy to share code that shouldn't be shared. Discipline matters more; CODEOWNERS by path helps.
- One broken `bun install` blocks everyone. Lockfile-commit discipline is load-bearing.
- The portal-api `sdk@0.1.1` → current gap is exposed and must be resolved (the gap was hidden behind the git tag; in-tree, there's only the current version).

**Neutral.**

- PR review queue noisier per-PR; CODEOWNERS routes review appropriately.
- Per-app deploys preserved via path-filtered Cloud Build triggers (ADR 0004).
- The `@coms-portal/*` npm namespace is preserved across the move; only the directory and repo names change.

## Alternatives considered

**Polyrepo + private npm registry (GCP Artifact Registry).** Solves drift via semver discipline. Right answer when you have third-party consumers you don't control. We don't. The ceremony of publish-then-bump-everywhere is permanent overhead for a coordination problem we have authority to eliminate.

**Two monorepos: libs-monorepo + apps stay as separate repos.** Adds a release boundary without simplifying ownership. The libs co-evolve with the portal app; splitting them creates artificial seams and lets the publish-pin dance survive.

**Status quo polyrepo.** Becomes untenable at the rate of new consumer additions. Each new app is +5 git-URL pins to maintain. Apps 3 and 4 would each add their own.

## References

- Integration contract §§ 1, 8.
- Heroes' `packages/server/package.json`, `packages/web/package.json` — shows the git-URL pin pattern in current state.
