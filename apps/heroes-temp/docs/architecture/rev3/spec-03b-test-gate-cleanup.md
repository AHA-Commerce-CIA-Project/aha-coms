# Rev 3 — Spec 03b: Spec 03 Test-Gate Cleanup

> **Status (2026-04-29): ✅ Shipped — locally green (261 pass / 0 fail / 0 typecheck errors).** Ready for CI verification + deploy unblock on the next push to `main`.
> Original priority: **High — blocks deploy.** CI's `Typecheck & Unit Tests` job had been red on `main` since the Spec 03 merge. Typecheck stayed green throughout; the failing gate was `bun run --cwd apps/api test`. Until this lands, the deploy workflow's `Build, Migrate & Deploy` job stays skipped and staging continues to run the pre-Spec-03 release.
> Scope: Portal `apps/api` test fixtures only. No production source changes shipped.
> Prerequisites: Spec 03 merged to `main` (commit `e296ab5` and follow-up `b407682`).

---

## Outcome (2026-04-29)

Single PR, ~12 test files touched, 1 new shared helper. The original three-PR phasing collapsed because diagnostic work showed every failing test passed in isolation — the entire 55-failure surface was cross-file `mock.module` contamination, not real fixture or assertion bugs.

### What shipped

1. **Single real bug fix** — `apps/api/src/__tests__/workspace-sync-removal.test.ts` referenced `apps/web/src/lib/components/layout/Sidebar.svelte`, removed in the SvelteKit migration. Brittle anti-test assertion deleted.

2. **New shared test helper** — `apps/api/src/test-helpers/schema-barrel-mock.ts` exposes:
   - `fullSchemaBarrelMock()` — full `~/db/schema` surface (every table that the barrel re-exports, with column-name sentinels). Eliminates partial-barrel `SyntaxError: Export named 'X' not found`.
   - `fullDrizzleOrmMock()` — full `drizzle-orm` surface (every operator and type-builder production schema files reference at module load).
   - `mockSpecs(specs, factory)` — registers one factory under multiple specifier spellings (`'../foo'`, `'../../foo'`, `'~/foo'`) since Bun's mock store keys by literal specifier string.

3. **Snapshot+restore pattern** for shared service modules. Every test file that mocks `~/services/auth-broker`, `~/services/oidc-verifier`, `~/services/manifests`, `~/services/aliases`, `~/services/session-revocation`, or `~/services/claims` now: (a) snapshots real exports BEFORE mocking via `const realX = { ...(await import('~/services/X')) }`, (b) spreads them into the mock with file-specific overrides, (c) restores via `afterAll`. Applied to `routes/__tests__/userinfo.test.ts`, `routes/__tests__/aliases.test.ts`, `services/__tests__/app-user-config.test.ts`, `middleware/__tests__/app-token.test.ts`.

4. **Prototype-patch over module-mock for vendor SDKs.** `services/__tests__/oidc-verifier-verify-google-id-token.test.ts` was rewritten to patch `OAuth2Client.prototype.verifyIdToken` directly instead of `mock.module('google-auth-library', …)`. Module-level mocks of vendor SDKs fail when sibling tests load the production module first — `oidc-verifier.ts`'s `const oauthClient = new OAuth2Client()` is bound at first import. Prototype patching is order-independent because JS dispatches through the prototype on every method call.

5. **Where-mock predicate shape alignment.** `routes/__tests__/userinfo.test.ts`'s deprecated-row filter heuristic (`{op: 'ne', r: 'deprecated'}`) updated to match the shared helper's emitted shape (`{type: 'ne', right: 'deprecated'}`).

### Files modified

```
.codebase-memory/adr.md                                                       (§6.4 + §7 updated)
apps/api/src/test-helpers/schema-barrel-mock.ts                               (NEW)
apps/api/src/__tests__/workspace-sync-removal.test.ts                         (Sidebar assertion deleted)
apps/api/src/middleware/__tests__/app-token.test.ts                           (snapshot+restore for oidc-verifier; helpers adopted)
apps/api/src/routes/__tests__/aliases.test.ts                                 (snapshot+restore for services/aliases via mockSpecs)
apps/api/src/routes/__tests__/userinfo.test.ts                                (snapshot+restore for 4 service modules; helpers adopted; ne-shape fix)
apps/api/src/services/__tests__/aliases.test.ts                               (helpers adopted)
apps/api/src/services/__tests__/app-user-config.test.ts                       (snapshot+restore for manifests via mockSpecs)
apps/api/src/services/__tests__/apps.test.ts                                  (helpers adopted)
apps/api/src/services/__tests__/employees.test.ts                             (helpers adopted; spread + override identityUsers/teamMembers)
apps/api/src/services/__tests__/oidc-verifier-verify-google-id-token.test.ts  (OAuth2Client.prototype patch)
apps/api/src/services/__tests__/provisioning-events.test.ts                   (helpers adopted; spread + override locals)
apps/api/src/services/__tests__/session-revocation.test.ts                    (helpers adopted; spread + override locals)
docs/architecture/rev3/spec-03b-test-gate-cleanup.md                          (this file)
.nelson/missions/2026-04-28_050010_1b5c498e/captains-log.md                   (post-mission follow-up section)
```

---

## Why this existed

Spec 03 shipped twelve effects across alias layer, per-app config, and admin UI — typecheck-green, with `188 pass / 53 fail` on the test suite locally (later observed as 188 pass / 55 fail). Main's pre-Spec-03 baseline was already `41 fail`, so the merge added ~12 net new failures and inherited the existing ones. Both classes blocked the same CI gate.

The deploy workflow gated on `Typecheck & Unit Tests` succeeding. With it red, every push to `main` skipped Build/Migrate/Deploy. The portal continued serving the prior release while `main`'s source advanced.

This spec catalogued the failures, classified them by cause, and prescribed the minimum change to clear the gate without scope creep.

---

## Root cause (as diagnosed)

Bun's `mock.module(...)` is **process-global**: registrations from file `A.test.ts` survive into file `B.test.ts`, and modules imported in `A` are cached with `A`'s mock surface. When `B`'s preamble registers a different (or partial) mock for the same module, `B`'s `await import(...)` may return a module bound to `A`'s mocks rather than `B`'s — depending on file-discovery order. macOS and Linux walk the filesystem in different orders, so failures looked different locally vs CI.

Three concrete contamination patterns surfaced:

| # | Pattern | Symptom | Source files | Resolution |
|---|---|---|---|---|
| A | Partial barrel mock | `SyntaxError: Export named 'X' not found in module '~/db/schema/index.ts'` | `aliases.test.ts`, `apps.test.ts`, `employees.test.ts`, `provisioning-events.test.ts`, `session-revocation.test.ts`, `userinfo.test.ts` | `fullSchemaBarrelMock()` |
| B | Partial service mock | Stub bleeds into sibling that exercises real impl | `userinfo.test.ts` (auth-broker, oidc-verifier, session-revocation, claims), `app-user-config.test.ts` (manifests), `app-token.test.ts` (oidc-verifier), `routes/aliases.test.ts` (services/aliases) | Snapshot real, spread + override, restore in `afterAll` |
| C | Vendor SDK module mock + cached production module | Production module bound to real SDK at first import; later `mock.module(SDK)` ignored | `oidc-verifier-verify-google-id-token.test.ts` mocking `google-auth-library` after `userinfo.test.ts` already loaded `oidc-verifier.ts` | Patch SDK prototype method directly |

---

## Failure inventory (as observed pre-fix)

CI run `25042390366` on `b407682` reported 53 fail; local `e0bbebe` (current `main` after my fix's predecessors landed) reported 188 pass / 55 fail / 1 error. Distributed across 14 test files. **Every file passed in isolation** — confirmation that all failures were cross-file contamination.

Top contaminator chains identified during bisection:

- `routes/__tests__/userinfo.test.ts` ran first (alphabetically) and registered partial mocks for `~/services/auth-broker` and `~/services/oidc-verifier`. These leaked into `services/__tests__/auth-broker-{audience,dual-mode,issuer}.test.ts`, `services/__tests__/auth-broker.test.ts`, and `services/__tests__/oidc-verifier-verify-google-id-token.test.ts`.
- `services/__tests__/app-user-config.test.ts` mocked `../manifests` with stubs that replaced `validateConfig` and `registerManifest`. These leaked into `services/__tests__/manifests.test.ts` whose tests assert real implementation behavior.
- `routes/__tests__/aliases.test.ts` mocked `~/services/aliases` with stubs replacing `resolveAliases`/`detectCollision`/`renamePrimaryAlias`. These leaked into `services/__tests__/aliases.test.ts` which exercises the real impls.
- Multiple files mocked `~/db/schema` with partial export surfaces, missing `appUserConfig`/`userAliases`/`appManifests`/`bulkEditLocks`/etc. — the SyntaxError class.

---

## Decisions

### Test fixtures only; no production changes

Held. Production code did not change. The gate failed entirely on fixture-shape mismatches from cross-file mock contamination.

### One PR per class, sequenced by safety — superseded

The original Class A/B/C three-PR phasing assumed real fixture bugs distributed across the failure surface. Once diagnostic work showed every file passed in isolation, the contamination class became a single problem with three sub-patterns (table above). All three resolved together in one PR; splitting would have created merge dependencies without isolating blast radius.

### CI green is the only success metric

Held. Local `bun run --cwd apps/api test` returns exit code 0; CI verification on push.

### Env-var declarations are added to CI, not faked locally

Held — but no env-var changes were needed. The `requireAppToken` CI failures reported in the original spec were also cross-file contamination, not env-var omissions.

---

## Out of scope (held)

- **New test coverage.** Red-cell-flagged should-fix items remain Spec 03 quality-of-life debt.
- **Migrating from `bun:test` to vitest.** The contamination workaround in this spec is a working pattern; a runner migration is a separate, much larger spec.
- **Refactoring production source for testability.** Did not occur.
- **Heroes-side test work.** Separate repo, separate engagement.

---

## Success criteria (final state)

1. ✅ `bun run --cwd apps/api typecheck` — 0 errors. Held throughout.
2. ✅ `bun run --cwd apps/api test` locally — 0 failures, 0 errors (261 pass).
3. ⏳ CI on next push — expected green; deploy workflow expected to run `Build, Migrate & Deploy`.
4. ✅ Captain's log at `.nelson/missions/2026-04-28_050010_1b5c498e/captains-log.md` updated with the post-mission follow-up section pointing here.

---

## Canonical pattern (enforced going forward)

Documented in `.codebase-memory/adr.md` §7. Three rules for any new test file touching shared modules:

1. **Schema barrel mocks must declare the FULL surface.** Use `fullSchemaBarrelMock()`; spread + override only the local-const sentinels your `tx.insert(table)` reference-equality branching depends on.
2. **Service-module mocks must snapshot+restore.** `const realX = { ...(await import('~/services/X')) }` BEFORE the `mock.module` call; in `afterAll`, `mock.module('~/services/X', () => realX)`. Without this, your stubs leak into the file that tests `X`'s real implementation.
3. **Don't `mock.module(vendor-sdk, …)` for vendor SDKs that production code instantiates at module load** (e.g. `google-auth-library`'s `OAuth2Client`). Patch the prototype method instead — module-level mocks fail when a sibling test loads the production module first. See `services/__tests__/oidc-verifier-verify-google-id-token.test.ts` for the pattern.

---

## Notes (kept for forensic continuity)

- The local `bun run --cwd apps/api test` did NOT match CI exactly pre-fix — CI's clean environment and Linux file-discovery order surfaced contamination that macOS file-discovery order papered over. Post-fix, the snapshot+restore pattern makes ordering irrelevant: each file leaves the mock store in its pre-mock state.
- The Spec 03 captain's log at `.nelson/missions/2026-04-28_050010_1b5c498e/captains-log.md` documents the upstream patterns that produced these failures (captains scoping typecheck narrowly, generic "fix typecheck" tasking, Bun mock.module process-global leakage). The "Test-mock contamination" line under "Lessons → Adopt" graduated from observation to enforced pattern.
- The backup tag `spec03-backup-pre-reword` preserves pre-rebase commit hashes for any forensic needs.

---

## Linked artifacts

- Spec 03: `docs/architecture/rev3/spec-03-user-identity-alias-layer.md`
- Spec 03 captain's log (with post-mission follow-up): `.nelson/missions/2026-04-28_050010_1b5c498e/captains-log.md`
- Spec 03 red-cell review: `.nelson/missions/2026-04-28_050010_1b5c498e/red-cell-review.md`
- ADR (canonical pattern + Spec 03b shipped status): `.codebase-memory/adr.md` §6.4 + §7
- Failing CI run (pre-fix): GitHub Actions run `25042390366` on commit `b407682`
- Pre-merge baseline failure run: `25034566583` on commit `baee7b7`
- Shared test helper: `apps/api/src/test-helpers/schema-barrel-mock.ts`
