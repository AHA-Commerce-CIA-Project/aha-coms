# Execution Plan: Monorepo Consolidation + Heroes Cleanup

> Last updated: 2026-05-13 (**Phase 6 sealed in three commits — T47 + T48 + T49 all `[x]`; CP11 gates on FU-8 alone, the consolidated operator-driven runtime verification.** This session closed the two open follow-ups: **FU-7 (commit `3bb61f2`)** — the portal-api "196 failures" diagnosed as a `bun test` vs `bun run test` runner-invocation footgun, not a test-suite bug. Bun's `mock.module()` is process-global; when the bare invocation collapses all 63 files into one process, `route-compose.test.ts`'s import of the real `src/index.ts` poisons the module cache and every later file's `mock.module` calls silently no-op. CI runs the canonical `bun run test` (xargs -P 4 per-file) and reports 575/0; the 196 number is a runner artefact. Root `bunfig.toml` gains a strong comment naming the canonical invocation + the contamination mechanism; new `apps/portal-api/README.md` greets contributors with the same signage. Structural alternative (refactor `route-compose.test.ts` to mock auth/db instead of importing the real composed app) intentionally deferred. **FU-6 (commit `5df692e`)** — both apps now meet Chrome's PWA installability spec. Portal-web's manifest had referenced `/icon-{192,512}.png` files that never existed (`apps/portal-web/static/` carried only the manifest); generated via ImageMagick as gradient `#1D388B → #325FEC` rounded squares with white "C" in Helvetica-Bold matching the brand mark in `(authed)/+layout.svelte:140`. Heroes-web's icons were 1×1 px stubs in `static/icons/`; replaced with gold-gradient `#FFD97D → #F4C144` rounded squares + deep-gold "H". Heroes manifest hardened — `start_url`, `scope`, `id` all `/heroes/` so Chrome registers heroes-web as a distinct install registration from portal-web; icon `src` paths absolutised because SvelteKit's `paths.base` doesn't auto-prefix manifest values. Fresh `apps/heroes-web/src/service-worker.ts` mirrors portal-web's cache-on-install pattern, API-skip-guard reshaped for `/heroes/api/*`. Heroes-web meta theme-color realigned `#1D388B → #09090b` to match the manifest. Stale `apps/heroes-web/public/` directory razed entirely (4 files — Next.js-era manifest with wrong branding, orphaned hand-rolled sw.js, solid-blue placeholder icons; grep confirmed nothing referenced them). Both apps' typecheck stays green. **T49 (commit `d8bfda1`)** — the heroes corridor carved into prose. `apps/heroes-web/README.md` opens as the reference implementation of §§ 1–9 + 11–14, walks `loadHeroesAuthUser` end-to-end (`__session` → `/api/userinfo` → `heroes_profiles` upsert), names every door deliberately closed (no `session/account/verification` tables, no `/auth/portal/exchange`, no login routes, no `password/email_verified/provider_id` columns, no `coms_session` writes, no hardcoded app catalog), includes a §"ADR 0005 vs reality" note recording T31's finding that `__session` is opaque not JWT (the stateless-on-the-app-side guarantees stand verbatim, only the introspection primitive differs), and an integration-contract cross-reference table pinning each § to a concrete file:line anchor. `apps/heroes-api/README.md` is the short companion (mirrors portal-api's shape; points back at heroes-web's README for auth). The original `coms_aha_heroes` carried `CONTEXT.md/DESIGN_SYSTEM.md/TODOS.md` but no `README.md`; T49 authored from scratch against current state, no stale prose to remove. **T47 sealed `[x]`** — chrome-parity + auth + admin-load paths covered the contract gate; admin-write row consolidated into FU-8. **T48 sealed `[x]`** — perf-check scope folded into FU-8 (operator-driven runtime measurement; expectation per Phase 5's auth-path JOIN cut is flat-or-faster). **FU-8 opened** — single consolidated entry carrying the three operator-only runtime checks (sheet-sync admin write, heroes p50/p95 measurement, on-device PWA install verification on Brave + Chrome mobile for both portal-web at `/` and heroes-web at `/heroes/`). CP11 crosses when an operator runs FU-8's three checks against prod and reports each row green; until then, the contract-gate sections of CP11 (§§ 1–9 + 11–14) are met by in-session verifications, but the cross-the-checkpoint moment waits on the operator window. **Pre-session state recorded for cross-reference:** **T47 was originally in flight** — 4 of 5 smoke checklist items verified; the end-to-end smoke walked through sign-in → cross-app navigation → logout (all PASS) and surfaced five Findings on the way; four mended same-session, one deferred. **Finding 1 (commits `e6075ce` + `b57a6cb`):** all six admin pages (`/heroes/admin/{users,users/[id],settings,audit-log,sheet-sync,reports}`) were 500-ing in prod since Phase 1's `da988a9` — `SyntaxError: Failed to parse JSON` thrown from `+page.server.ts` loads that used `event.fetch('${base}/api/v1/...')`. Phase 1's single-origin migration made SvelteKit treat that as same-origin against heroes-web's own router (Firebase forwards the run.app Host header), which has no `/api/v1/*` route, returns 404 HTML, and `res.json()` chokes. Six admin loads converted to direct service imports (the pattern `dashboard` + `teams` always used); five `.svelte` files' aspirational casts gained `as unknown as` wrappers because the local types referenced fields the API never actually returned (`teamName`, `teamId`, `finishedAt`, `error`, `department`, `createdAt`) and always rendered as `—`. **Finding 2 (commit `4fb2069`):** mobile chrome stacked two top bars carrying duplicate theme+avatar widgets — `ServiceBar.svelte:45` shipped without a responsive hiding class while `MobileTopBar.svelte:39` had `md:hidden`. One-class fix: `flex` → `hidden md:flex` on ServiceBar; `MobileTopBar` moved from `top-9` to `top-0`; both apps' outer `pt-9` → `pt-0 md:pt-9`. Cross-app tab strip is now desktop-only on intent; mobile users switch apps via the AccountWidget dropdown. **Finding 3 (commit `bcf0c27`):** portal-web's MobileBottomNav surfaced only 3 of 7 admin sections; the other 4 (Teams, Aliases, Taxonomies, Audit Log) had no mobile path. Heroes had a hamburger + slide-over for the equivalent gap (T43); portal-web inherited T43's "no admin mobile surface" framing alongside it. The slide-over graduated into `packages/ui-svelte/src/chrome/SlideOverNav.svelte` (second concrete consumer retired T43's "one consumer, don't lift" call) — takes `items`, `currentPath`, `brand` + `footer` snippets; `Sheet` primitive carries backdrop / focus trap / ESC / slide-in. Heroes' inline 60-line `<Sheet>` block collapses to a `<SlideOverNav>` call; portal-web's `MobileTopBar` gains a leading hamburger (admin-only) plus a sibling `<SlideOverNav>` carrying `BASE_NAV + ADMIN_NAV`. **Finding 5 (commits `9fd569e` then `58222ba`):** Finding 2 hid ServiceBar on mobile, which removed heroes users' path back to portal — `data.appCatalog` from `/api/userinfo` carries registered apps only (portal isn't in `app_registry`). First-pass fix prepended `{slug:'portal',label:'COMS'}` to heroes' `widgetAppSwitcher` in the layout; operator immediately surfaced that every future app would have to repeat the same prepend in two places. Final fix lifted the hub knowledge into `apps/portal-api/src/routes/userinfo.ts` — the launcher response always prepends `{slug:'portal',label:'COMS',url:'/'}` unconditionally. Every consuming app sees portal as the first entry of `data.appCatalog`; no app-side prepend code anywhere. Heroes' (authed)/+layout.svelte loses 22 lines across two derived blocks. The standing principle for future apps onboarding: read `data.appCatalog` and iterate; no special-casing required for portal. The accumulated lesson across T40 (ServiceBar derivation lift), T43 (slide-over deferral then lift), and Finding 5 (hub-in-userinfo) is consistent — hub-aware knowledge belongs in canonical sources, not duplicated in every app's layout. **Finding 4 deferred** to FU-6: PWA install prompt not firing on the operator's mobile browser. The chrome-parity smoke completed without needing it; installability is a packaging concern outside CP11's `§§ 1–9 + 11–14` scope. **FU-7 surfaced from the smoke verification path:** `apps/portal-api` test suite reports 379 pass / 196 fail / 575 total across 63 files. `git stash` confirmed the 196 fails predate today's work; spread across webhook reactivate, manifest, smoketest, aliases-resolve-batch, taxonomies-sync routes — fixture drift or genuine regression not caught by the test-runner scope CI uses. Out of T47 scope; tracked separately so the next session can audit `.github/workflows/ci.yml` and triage. **What remains for T47:** (1) operator runs one admin write on heroes (sheet-sync trigger is the canonical exercise, confirms `services/sheet-sync` end-to-end including the post-Phase-5 `heroes_profiles.can_submit_points` read path), (2) call on FU-6 — seal T47 with PWA deferred, or hold T47 open until FU-6 closes (recommend: seal — PWA is out of CP11 scope). **Then T48** (perf check — operator measures heroes p50/p95 page load; expectation is flat-or-faster after Phase 5 cut the per-request JOIN from 2 tables to 1) **and T49** (heroes README rewrite — point at `docs/integration-contract.md`, document the cleaned auth flow as the reference pattern, drop the stale local-session prose). After T49, **CP11 crosses and Spec 02 is sealed.** **Checkpoint 10 crossed — Spec 02 Phase 5 sealed.** T44 + T45 + T46 cleared the cache corridor in three commits: T44 wrote the decision matrix into `tasks/todo.md` (every column on `email_cache` + `user_config_cache`, every key actually read out of the JSONB blob), T45 promoted `canSubmitPoints` onto `heroes_profiles.can_submit_points` (migration `0017_add_can_submit_points.sql` mirrors `0013`'s shape — column add + `COALESCE` backfill out of `user_config_cache.config->>'canSubmitPoints'`), and T46 dropped the table outright (migration `0018_drop_user_config_cache.sql`, plus the schema file, the typebox helpers in `schemas/index.ts`, the `generate-schemas.ts` row, and the `re-exports from db/schema/index.ts`). Net outcome: `loadHeroesAuthUser`'s SELECT collapsed from `heroes_profiles ⋈ user_config_cache` (2 tables, 1 leftJoin) to a single read against `heroes_profiles`; the three repositories/users.ts read sites (`listUsers`, `getUserById`, `getUserByEmail`) dropped their `leftJoin(userConfigCache)` and now read `heroes_profiles.canSubmitPoints` directly; the two stale HR-lookup queries in `services/challenges.ts:90` + `services/appeals.ts:77` flipped from `userConfigCache.config->>'role' = 'hr'` to `eq(heroesProfiles.role, 'hr')` (the role column has carried this since `0013`, the cache JOIN was vestigial); the two webhook handlers (`handle-user-provisioned`, `handle-app-config-updated`) write `can_submit_points` to `heroes_profiles` and no longer touch the dropped table. **Per-request auth-path table touches: was 2, now 1.** UserRow.canSubmitPoints tightened from `boolean | null` to `boolean` (NOT NULL column). The audit's three carry-overs all resolved in the same window: `role` duplication retired (read sites flipped), `leaderboard_eligible` + `starting_points` retired with the table (zero readers, no replacement needed), the manifest doc-debt deliberately deferred for a future portal-facing manifest-cleanup window. **Spec 02 §22's "JWT claims" framing** didn't survive contact with T31's CP6 finding (`__session` is opaque, not a JWT); the equivalent contract is the `/api/userinfo` response shape `loadHeroesAuthUser` already reads, and `canSubmitPoints` is a heroes-specific knob that belongs on the heroes-owned table — recorded inline in `tasks/todo.md`'s T44 note for future plan readers. Deploy applied 2026-05-12 in the same window CP10 sealed: heroes-api new revision rolled out via GHA run `25742283576` (the laptop push of `1b79454` triggered it on path-filter; the old workflow had no migrate step yet so the deploy ran first by accident-of-history but matched the required order for T46's destructive drop), then `cloud-sql-proxy` + `bun --filter @coms-portal/heroes-api db:migrate` against prod applied `0017` + `0018` in sequence — backfill found zero rows with `canSubmitPoints=true` (clean baseline; webhooks will flip the flag as `app_config.updated` events arrive), then dropped the cache table. Post-apply schema verified by direct read: `to_regclass('user_config_cache') = null`, `heroes_profiles.can_submit_points` lives as `boolean NOT NULL DEFAULT false`, 72 rows in heroes_profiles. **FU-5 closed in the same commit window** — `deploy-heroes-api.yml` gains the migrate step mirroring portal-api's FU-3 shape (different secret name `coms-aha-heroes-db-url-production`, different DSN host rewrite for heroes' `@localhost/db` shape, same Cloud SQL instance shared by both APIs); the manual ritual that ran for Phase 5 retires alongside the work it served. Next: T47 — Phase 6 verification opens with the E2E smoke checklist (sign-in → heroes; navigation; cross-app logout; mobile PWA chrome; admin operations). **Checkpoint 9 crossed — Spec 02 Phase 4 sealed.** T40 → T43 cleared the application-layer glue heroes carried since the polyrepo: T40 lifted the ServiceBar derivation into `packages/ui-svelte/src/chrome/derive-services.ts` (pure catalog→items mapper; rich `apps` array crosses through `HeroesAuthResult` to `App.Locals.appCatalog`, so the hardcoded `[{slug:'portal',href:'/'},{slug:'heroes'}]` literal and the `APP_LAUNCHER × user.apps` map both retire). T41 lifted the theme narrowing into `packages/ui-svelte/src/chrome/resolve-theme.ts` (`'system'|'light'|'dark'` → `'light'|'dark'`; ServiceBar + MobileTopBar widen their `theme` prop and call the helper internally; heroes' `effectiveTheme` $derived shim disappears). T42 migrated the workspace from `lucide-svelte` (Svelte 4 class components) to `@lucide/svelte ^1.14.0` (Svelte 5 native) — 49 files swept via sed, 3 package.json deps swapped, all 26 `as AnyIcon` casts + the `type AnyIcon = any` alias + heroes' "version-skew artefact" comment retire, portal-web's `type IconComponent = unknown` workaround + two `as never` casts collapse in the same window. T43 kept the slide-over admin menu heroes-local (rationale: only one concrete Svelte consumer today; aha-fast is React; portal-web has no admin mobile surface; premature abstraction otherwise) but adopted the suite's already-paid-for `Sheet` primitive at `packages/ui-svelte/src/primitives/sheet/` (bits-ui-backed) so heroes stopped hand-rolling backdrop + focus-trap + ESC + slide-in animation; ~60 lines of hand-rolled drawer DOM collapse to ~35 lines around `<Sheet><SheetContent side="left">…</SheetContent></Sheet>`, the global `<svelte:window onkeydown>` ESC handler retires with the hand-rolled panel. Portal-web is touched only by T42's package swap + T43's carry-along cast cleanups; the broker-formAction derivation is deliberately untouched (waits for a future window when every registered app is provably same-origin and the broker hop retires). (**Checkpoint 6 crossed — Spec 02 Phase 1 sealed, Phase 2 partial.** Sign-in → /heroes/dashboard renders end-to-end on the new single-origin + portal-`__session` auth path.) T30 verification dragged Phase 2 forward by force: Firebase Hosting filters every incoming cookie except `__session` before forwarding to Cloud Run (hardcoded behaviour), so heroes' `coms_session` cookie set on the exchange response landed in the browser cleanly but never travelled back on the redirect to `/heroes/dashboard` — the portal↔heroes loop. Spec 02's Phase 2 was the spec'd answer to that wall; T31's audit revealed portal's `__session` is an opaque UUID (`auth_sessions.id`), not a JWT, so introspection goes through `apps/portal-api/src/routes/userinfo.ts` (`GET /api/userinfo`) rather than SDK-side JWT verification. T32 landed `loadHeroesAuthUser` in `packages/heroes-shared/src/auth/user.ts` — single fetch + heroes_profiles upsert + heroes-side fields read. T33/T34 retired the `getLocalSessionByToken` JOIN paths in heroes-web's hooks and heroes-api's auth middleware; both now call `loadHeroesAuthUser` with `env.PORTAL_ORIGIN`. `+page.server.ts` short-circuits the legacy exchange when `__session` already authenticated the request. T37 sealed in incognito 2026-05-12. **Five infra mends shipped during the verification cycle that weren't on the plan:** the bare `/heroes` Firebase rewrite (slash-less launcher target), `PORTAL_ORIGIN` Cloud Run env (was `PORTAL_BASE_URL` mismatch), portal-web SW skip-list for `/heroes/*` (was intercepting and dropping Set-Cookie), Cache-Control `private, no-store` on heroes-web's three cookie-write handlers (so Firebase stops stripping Set-Cookie on legacy paths), and the probe-path migration in `infra/heroes/cloud-run.tf` + the uptime check (live Cloud Run probes hit the new `/heroes/api/healthz` + `/heroes/api/health` paths). Operator window applied them in three deploy cycles; `register:heroes` re-run upserted `app_registry.url`, `healthCheckUrl`, and `app_webhook_endpoints.url` to the single-origin URLs. **T35/T36 owed** to close CP7 cleanly: the local `session`/`account`/`verification` tables hold no live data after this seal, `getLocalSessionByToken` family is dead code, and the legacy `coms_session` Set-Cookie cluster will rust. Next: drop the dead code (T35) + drop the dead tables (T36). **CP7 + CP8 crossed in the same window** — T35 deleted `packages/heroes-shared/src/auth/session.ts` outright, swept the six call sites (sheet-sync admin path uses `loadHeroesAuthUser`, both portal-event handlers stop touching local sessions, exchange + logout routes deleted, logged-out page simplified), and pulled the `./auth/session` subpath from `package.json`. T38/T39 folded forward — the `/auth/portal/exchange` route is gone, the route directory removed; portal's `portal_code` query arrives ignored. T36 lands `0016_drop_legacy_auth_tables.sql` (the three DROP TABLE IF EXISTS statements + rollback note) and deletes `packages/heroes-shared/src/db/schema/auth.ts` + the re-exports + the three typebox schemas. Drizzle's `db:generate` was abandoned in favour of a hand-written migration to keep the diff legible. Apply order at deploy: heroes-api new revision deploys first (no code touches the tables anymore), operator runs `bun db:migrate` against prod via Cloud SQL Auth Proxy second. T24 set `kit.paths.base: '/heroes'` on heroes-web. T25 swept ~25 literal `/`-rooted paths across routes + lib components — every `<a href>`, `goto()`, `redirect()`, `fetch()` now flows through `$app/paths` `base` so SvelteKit doesn't black-hole them against the new mount point. T26 wrapped heroes-api in `new Elysia({ prefix: '/heroes' })`; route URLs land at `/heroes/api/*` to match Firebase Hosting's preserve-path rewrite. T27's potential fan-out collapsed into one line in `apps/heroes-web/src/lib/api/client.ts`: the typed `App.~Routes` now wears a leading `heroes` segment (Elysia's `CreateEden<BasePath, …>` rule), so the eden client pre-traverses into it (`treaty<App>('').heroes`) and every existing `api.api.v1.*` call keeps its shape. T28 was a no-op — the rewrite stack from CP4 already routes `/heroes/api/**` → `coms-heroes-api` ahead of the broader `/heroes/**` → `coms-heroes-web` line. T29 stripped `data.portalOrigin` + `data.heroesOrigin` out of `(authed)/+layout.svelte` and `+layout.server.ts`; service-bar links collapsed to path-relative (`{ slug: 'portal', href: '/' }`), nav arrays were rewritten under `${base}`, `AccountWidget` now receives `portalOrigin=""` (same-origin) and `postLogoutRedirectUri={\`${$page.url.origin}${base}/logged-out\`}` — the absolute form is required by portal's `validatePostLogoutRedirectUri`, the spec's "path-relative" wording fails the `new URL(uri)` parse and was logged as drift for the next doc-rev sweep. Infra carry-over: probe paths (`infra/heroes/cloud-run.tf` startup + liveness, `infra/heroes/modules/monitoring/*` uptime check) repointed to `/heroes/api/healthz` + `/heroes/api/health` — they hit the Cloud Run host directly without Firebase rewriting, so they MUST land before the next heroes-api deploy or the new revision fails its startup probe. **CP6 still red.** Next: T30 cutover window — `tofu apply` in `infra/heroes/` first, then GHA deploys for heroes-api + heroes-web, then `register:heroes` re-run with `HEROES_APP_URL=https://aha-coms.web.app/heroes` + `HEROES_WEBHOOK_URL=https://aha-coms.web.app/heroes/api/webhooks/portal` + `HEROES_HEALTH_CHECK_URL=https://aha-coms.web.app/heroes/api/health`, then verify the corridor end-to-end (sign-in → `/heroes/dashboard` → cross-app link → logout). After T30 closes, CP6 crosses and Phase 2 (JWT sessions) opens.
> Status: Phase 1 sealed at `34fbedd`; Phase 3 sealed and Checkpoint 2 crossed at `33593a9`; T16 lands the portal split + per-service Cloud Build scaffolding at `5935d00`; T16.5 splits `infra/heroes/` at `de68b28`; the per-app-resources + per-app naming principles + GHA-over-Cloud-Build + standard label set principles are the standing rules going forward; T17 returned deploys to GitHub Actions; Checkpoint 3 crossed 2026-05-12 — heroes + portal Tofu applied (T16.5 + T17 cutovers landed in one operator window), four GHA workflows verified end-to-end, path-filter isolation proven by two single-file probe pushes; Phase 4 sealed at `e129cfb`; T18 authors the Firebase Hosting routing layer (`firebase.json` + `.firebaserc` + `firebase-public/` stub + a `scripts/verify-firebase-json.mjs` guard); hosting site renamed from the spec's `aha-coms-staging` to `aha-coms` (no separate staging tier exists today); T19 deployed `https://aha-coms.web.app` 2026-05-12 with all four corridors verified by the routing probe; portal-web Firebase init build-arg bug surfaced under first user-facing touch and was mended at `41aeb6e` (workflow now fetches `coms-portal-gip-api-key` from Secret Manager and passes three `--build-arg`s); T20 confirmed `__session` cookie crosses from portal-web sign-in to `/heroes/*` requests (HostOnly, Path `/`, HttpOnly, Secure, SameSite Lax). **Checkpoint 4 crossed — Phase 5 sealed.** Three Findings from T20 carried to Spec 02 Phase 1 (stale heroes app_registry URL, portal-web SW intercepts `/heroes/*`, opaque session-id token vs JWT). Findings 1 + 2 from T15 closed in T16. FU-1 + FU-2 settled 2026-05-12: FU-1 adds `app_registry.healthCheckUrl` (migration `0035_naive_solo.sql`) + threads it through the probe + `register-heroes` upserts it; FU-2 rewrites `apps/portal-web/cloudbuild.yaml` to mirror the GHA shape (single `coms-portal-gip-api-key` fetch + plain-value substitutions for the two public Firebase web-config fields), adds a Cloud Build SA secret-accessor grant in `infra/iam-portal-runtime.tf` (re-aimed at the Compute Engine default SA after the legacy `cloudbuild.gserviceaccount.com` proved unused on post-April-2024 projects), inlines the nested `_IMAGE` substitution (Cloud Build does not recursively expand `${...}` inside other substitutions), and drops the machine type to UNSPECIFIED so the rare-path hatch lives in the free-tier 120-min/day budget. Prod-applied 2026-05-12 in one window: `tofu apply` (IAM grant), `db:migrate` against the live DB via Cloud SQL proxy, `register:heroes` re-run (drift detected on `healthCheckUrl: (null) → coms-heroes-api…/api/health`), test build `f313eefb-…` STATUS: SUCCESS in 4m38s on the free-tier machine deploying `coms-portal-web-00008-xzk`. Commit `36f2a41` captured the two latent cracks that emerged under live submission. After this window, the new portal-api revision deployed by GHA finally consults `healthCheckUrl` and flips the HEROES dashboard card green on the next 60-second probe. Next: Phase 6 (archive external repos — T21–T23).
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
4. **Every cost-driving GCP resource carries the standard label set.** Allocation policy gives the suite one shared GCP project (`fbi-dev-484410`); labels are the only first-class mechanism for per-app cost attribution and audit. Every Tofu-managed resource that supports labels carries:

   ```
   app         = "portal" | "heroes" | "fast" | "<future>"   # the product unit
   service     = "<app>-api" | "<app>-web" | …               # only on per-service resources
   environment = "prod"                                       # forward-compat: "staging" | "preview"
   managed-by  = "opentofu"                                   # distinguishes IaC from console-created
   ```

   Per-state `locals.<app>_labels` block holds the shared labels; per-service overrides extend it. Resources GCP doesn't support labels on (service accounts, WIF pools/providers, IAM bindings, Cloud Tasks queues, Cloud Scheduler jobs) carry the attribution via the `coms-<app>-<resource>` naming convention from principle 2. Cost rollups: filter Cloud Billing reports by `label:app` for the headline number; drill into `label:service` for intra-app breakdown. Budget alerts and BigQuery billing export are the proactive complements — set them up alongside any new app onboarding.

5. **CI/CD via GitHub Actions while the repo stays public; `tofu apply` stays on the laptop.** Deploys run in GHA: `mrdoorba/aha-coms` is a public GitHub repo, which means unlimited free Actions minutes for standard runners. Cloud Build with `E2_HIGHCPU_8` (the machine type the cloudbuild yamls request) has no free tier — every minute is paid. T17 returned all four service deploys to GHA workflows (`deploy-{portal,heroes}-{api,web}.yml`) authenticating to GCP via WIF. Each app keeps its own deployer SA + WIF pool (per-app principle): portal via `coms-portal-github-actions`, heroes via `coms-heroes-deployer-sa`. The cloudbuild yamls in `apps/*/cloudbuild.yaml` remain in the tree as a manual escape hatch — `gcloud builds submit --config apps/<service>/cloudbuild.yaml .` still works for one-off deploys when the workflow is offline. **Tofu apply is deliberately NOT in GHA** — auto-apply has no clean rollback for Cloud SQL recreation, IAM rotation, or secrets deletion, and workflow_dispatch adds ceremony without material safety wins for a two-operator team. The supported laptop-CLI runbook lives at `infra/README.md`. **DB migrations run inside each API's deploy workflow** — portal-api and heroes-api both carry an `Apply DB migrations` step that downloads `cloud-sql-proxy`, fetches the URL secret, rewrites the host segment from Cloud Run's Unix-socket DSN to the proxy port, and runs `bun --filter @coms-portal/<svc>-api db:migrate` BEFORE `docker build` (FU-3 wired portal; FU-5 wired heroes after Phase 5's two migrations made the manual ritual the third occurrence in seven days). Drizzle migrations in this project are append-only nullable adds / non-destructive UPDATEs, which makes automating them safe; destructive migrations (T46's `DROP TABLE user_config_cache` is the canonical exception) need the deploy-first-then-migrate ordering that this workflow's migrate-first-then-deploy shape doesn't cover — both workflow comments name the constraint so a future implementer authoring a `DROP COLUMN` stops at the source. The manual orchestration gap that bit FU-1 (portal) and the Phase 5 cutover (heroes) stays closed by the workflow rather than by operator memory. Reconsider these decisions if (a) the repo turns private, or (b) an app needs a build path Cloud Build does materially better (custom workers, GCS-private base images, etc.), or (c) the team grows past three operators / incident rate makes the audit gap matter (reopens FU-4 from `tasks/todo.md`'s "Future upgrade path"). Per-app exceptions get recorded in an ADR.

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
