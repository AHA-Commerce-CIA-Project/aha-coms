# Rev 3 — Spec 03b: Spec 03 Test-Gate Cleanup

> Priority: **High — blocks deploy.** CI's `Typecheck & Unit Tests` job is red on `main` since the Spec 03 merge. Typecheck is green; the failing gate is `bun run --cwd apps/api test`. Until this lands, the deploy workflow's `Build, Migrate & Deploy` job stays skipped and staging continues to run the pre-Spec-03 release.
> Scope: Portal `apps/api` test fixtures only. No production source changes anticipated except where a missing CI env-var is required by a real code path.
> Prerequisites: Spec 03 merged to `main` (commit `e296ab5` and follow-up `b407682`).

---

## Why this exists

Spec 03 shipped twelve effects across alias layer, per-app config, and admin UI — typecheck-green, with `188 pass / 53 fail` on the test suite locally. Main's pre-Spec-03 baseline was already `41 fail`, so the merge added ~12 net new failures and inherited the existing ones. Both classes block the same CI gate.

The deploy workflow gates on `Typecheck & Unit Tests` succeeding. With it red, every push to `main` skips Build/Migrate/Deploy. The portal will continue to serve the prior release until the gate goes green, even as `main`'s source advances.

This spec catalogs the failures, classifies them by cause, and prescribes the minimum change to clear the gate without scope creep into broader test refactors.

---

## Failure inventory (snapshot from CI run `25042390366` on `b407682`)

### Class A — Pre-existing on `main` (carried from before Spec 03)

These were already failing on `baee7b7` (the Spec 03 branch base). Spec 03's merge did not introduce them, but the gate is shared so they must clear too.

1. **`workspace-sync-removal.test.ts`** — anti-test asserting the workspace-sync feature is not exposed in source surfaces. Likely failing because new files added during Spec 03 (or earlier work) match its grep heuristic. **Fix shape:** narrow the heuristic, OR delete the test if the feature has been gone long enough that ongoing surveillance is no longer needed.

2. **`auth-broker-audience.test.ts`** (multiple) — `brokerAudienceFor`, `sanitizeRedirectTo`, audience-binding-in-JWT-verification cases. **Fix shape:** investigate; likely env-var or fixture state that was lost in a prior commit and never restored.

3. **`resolveAuthUser.test.ts`** (3 cases) — DB-backed auth resolution. **Fix shape:** likely needs `DATABASE_URL` or a complete schema mock; this is the test-mock-contamination class Spec 03's commit `bbfaf3c` partially addressed.

4. **`auth-broker-dual-mode.test.ts`** (multiple) — `TypeError: "undefined" cannot be parsed as a URL`. Missing env var (likely `SERVICE_URL` or `PORTAL_BROKER_ORIGIN`) at test runtime. **Fix shape:** add the env var to CI's job env, or to the test's beforeEach setup.

### Class B — Introduced by Spec 03

5. **`requireAppToken` middleware tests (5 cases)** — all in `apps/api/src/middleware/__tests__/app-token.test.ts`. They pass locally (per Forge's bbfaf3c commit reporting 188 pass) but fail in CI. Suspected cause: a mock or env-var setup that is satisfied in local Bun runs but not in CI's clean environment. **Fix shape:** identify the divergence — likely `verifyGoogleOidcToken`'s mock-setup import order or a needed env var (`SERVICE_URL`, `OIDC_AUDIENCE`).

6. **`appUserConfig` schema-export contamination** — error: `SyntaxError: Export named 'appUserConfig' not found in module '/.../schema/index.ts'`. The barrel DOES export it (verified in code). Some test file's `mock.module('~/db/schema', ...)` is omitting `appUserConfig` and Bun's process-global mock leakage causes a downstream test to read the partial mock. Forge's `bbfaf3c` switched production source to schema-submodule imports to mitigate this; one or more test files still reach for the barrel. **Fix shape:** find every `mock.module('~/db/schema', ...)` call site; ensure each declares the full export surface or rewrite the test to mock the specific submodule the system-under-test uses.

### Class C — Possibly pre-existing, possibly Spec 03 — investigation needed

Some failures could not be cleanly classified from the CI log alone. The fix list above will surface them during triage.

---

## Decisions up front

### Test fixtures only; no production changes unless required

The merge of Spec 03 is functionally complete. Production code is correct (red-cell review confirmed conditional-go after must-fix items landed). The test gate is failing on fixture-shape mismatches and env-var omissions, not on real bugs. Scope this spec to test-fixture changes and CI env additions. If a fix requires production source change to support testability (e.g., dependency injection seam), call it out explicitly before the change lands.

### One PR per class, sequenced by safety

- **PR 1 — Class A pre-existing.** Pure existing-failure fixes. No risk of mis-classifying as Spec 03 work. Land first to establish a clean baseline.
- **PR 2 — Class B Spec 03 fixes.** `requireAppToken` CI mock setup + barrel-mock contamination. Build on PR 1.
- **PR 3 — Class C residuals.** Whatever remains red after 1+2.

Three small PRs over one large one because each isolates its blast radius and keeps `main` mergeable continuously.

### CI green is the only success metric

The local `bun run --cwd apps/api test` already passes 188 of 241; the goal is `bun run --cwd apps/api test` returning exit code 0 in CI. New tests are out of scope here — that's debt for whichever spec adds them.

### Env-var declarations are added to CI, not faked locally

If a test legitimately needs `SERVICE_URL` or `OIDC_AUDIENCE` to run, the fix is to add it to the GitHub Actions job env (or the test's beforeEach) — not to ship a hardcoded fallback in production source. The production source already reads from `process.env.X!` and that contract should not weaken.

---

## Out of scope

- **New test coverage.** The four red-cell-flagged should-fix items (TOCTOU on /single vs bulk lock, equivalence-test row-by-row, heroes_app_role precondition in cutover/README.md, per-app appConfig slice test) are spec-03 quality-of-life debt, not test-gate blockers. Track them separately.
- **Migrating from `bun:test` to vitest.** Bun's mock.module process-global behavior is the root cause of the contamination class; the fix here works around it via complete mock surfaces. A test-runner migration is a much larger spec.
- **Refactoring production source for testability** unless a Class B fix can't proceed otherwise.
- **Heroes-side test work.** Heroes is a separate repo and a separate engagement.

---

## Success criteria

Spec 03b is done when:

1. `bun run --cwd apps/api typecheck` — 0 errors (already true; protect from regression).
2. `bun run --cwd apps/api test` in CI — 0 failures, 0 errors.
3. The deploy workflow's `Build, Migrate & Deploy` job runs (rather than skipping) on the next push to `main`.
4. The captain's log of the Spec 03 mission is updated with a pointer to this spec's PR(s) so the test-debt → resolution chain is documented.

---

## Phasing

### Phase 1 — Class A pre-existing failures

1. Reproduce each failure locally in isolation (`bun test src/path/to/test.test.ts`) with whatever env vars are referenced. Document missing vars or fixture state.
2. For each, decide: env-var addition to CI, fixture restoration in test setup, or test deletion if the asserted behavior is no longer load-bearing.
3. Open PR 1, verify `bun run --cwd apps/api test` is green for the targeted file set.

### Phase 2 — Class B Spec 03 introductions

4. `requireAppToken` CI failures: read the failing CI log line-by-line, identify whether the divergence is mock-import-order or env-var. Mirror Forge's `bbfaf3c` pattern for mock isolation.
5. `appUserConfig` barrel contamination: grep `mock.module('~/db/schema'` across the codebase, ensure every call declares the full export surface (especially `appUserConfig`, `userAliases`, `appManifests`, `bulkEditLocks`).
6. Open PR 2, verify all five `requireAppToken` cases pass and the barrel-contamination SyntaxError is gone.

### Phase 3 — Residuals

7. Run the full suite. Anything still red is Class C. Triage and fix per the Phase-1 procedure.
8. Open PR 3, verify the gate is fully green.

### Phase 4 — Confirm deploy unblocks

9. Merge PR 3 (or PR 2 if no residuals). Watch the next CI run.
10. `Build, Migrate & Deploy` should execute. Confirm the staging URL serves the post-Spec-03 source (alias collision queue at `/admin/aliases`, app config at `/admin/app-config`).

### Estimated scope

- Phase 1: 0.5–1 day (depends how many Class A failures need investigation vs mechanical fixes).
- Phase 2: 0.5 day (the `requireAppToken` and `appUserConfig` issues are well-scoped).
- Phase 3: variable; expected ≤ 0.5 day.
- Phase 4: minutes.

Total: ~1–2 days portal engineering, single captain.

---

## Notes for the captain

- The local `bun run --cwd apps/api test` does NOT match CI exactly — CI's clean environment exposes mock-leakage and env-var dependencies that local Bun runs paper over via prior-test side effects. **Run failing tests in isolation** (`bun test src/path/to/foo.test.ts`) to reproduce CI behavior.
- The Spec 03 captain's log at `.nelson/missions/2026-04-28_050010_1b5c498e/captains-log.md` documents the pattern that produced these failures: captains scoping typecheck to their own files, generic "fix typecheck" tasking without enumerated files, and Bun's mock.module process-global leakage. Read it before starting.
- The backup tag `spec03-backup-pre-reword` preserves the pre-rebase commit hashes if any forensic needs arise.

---

## Linked artifacts

- Spec 03: `docs/architecture/rev3/spec-03-user-identity-alias-layer.md`
- Spec 03 captain's log: `.nelson/missions/2026-04-28_050010_1b5c498e/captains-log.md`
- Spec 03 red-cell review: `.nelson/missions/2026-04-28_050010_1b5c498e/red-cell-review.md`
- Failing CI run: GitHub Actions run `25042390366` on commit `b407682`
- Pre-merge baseline failure run: `25034566583` on commit `baee7b7`
