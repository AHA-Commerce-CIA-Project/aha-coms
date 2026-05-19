# Spec 05: aha-fast Onboarding

> Status: **sealed 2026-05-14 (CP21 crossed).** Authored 2026-05-13; all ten phases executed by 2026-05-14's eight-step operator walk against `https://aha-coms.web.app/fast/*`. Fast is the React-side reference implementation for the integration contract. Two carryovers survive the seal as deferred work, recorded in *Carryovers* below.
> Type: one-shot (executable plan; document dies once executed)
> Owner: TBD
> Prerequisites: Spec 01 (Monorepo Consolidation) complete; Spec 02 (Heroes Cleanup) sealed through CP11; fast's in-flight feature work frozen on `alifm17/aha-fast@main`
> Targets: integration contract §§ 1–9 and §§ 11–14; ADR 0002 (cross-framework UI fork), 0003 (single-origin PWA), 0004 (Firebase Hosting routing), 0005 (stateless JWT sessions — with the T31 reality-check that `__session` is opaque, not JWT), 0006 (GIP-only auth), 0009 (Bun for package management), 0010 (OpenTofu over Terraform), 0011 (fast keeps Prisma — open-question §1 resolution)

## Carryovers from the seal

Two threads stayed open when CP21 crossed; both are tracked in `tasks/todo.md` and neither blocks the contract claim:

1. **T64 (PK promotion).** Sub-phase (c)'s destructive `DROP TABLE` for `Session` / `Account` / `Verification` sealed 2026-05-14; the matching promotion of `User.portal_sub` to primary key remains deferred until the next operator window decides between rename-to-`fast_profiles` and in-place repurposing of `User`. Fast already reads `portal_sub` as the join key everywhere it matters; the constraint flip is cosmetic-plus-rigour, not load-bearing.
2. **T71 (Phase 5 closer marker).** A one-line documentation marker cross-referencing ADR 0011 from Phase 5's "SKIPPED" notice; cosmetic.

Six post-walk findings (F2, F5, F9, F11, F14, plus one cross-spec item) deferred from the operator walk are catalogued in `tasks/todo.md`; none are scope-of-Spec-05.

## Objective

Bring aha-fast (Next.js 16 + Better Auth + Prisma, currently a standalone repo) into the COMS monorepo as the **React-side reference implementation** for the integration contract. By end of this spec, fast is served at `aha-coms.web.app/fast/*` on the shared COMS origin, accepts portal-minted `__session` cookies via the React equivalent of `loadHeroesAuthUser`, ships chrome from the now-populated `packages/ui-react/` + `packages/account-widget-react/`, and stands as the worked example future React/Next.js apps onboard against.

Heroes proved the Svelte half of contract §§ 1–9 + 11–14. Fast proves the React half. Together they fix the contract's framework-parity claim in code, not just in ADR 0002's prose.

## Success criteria

This spec is done when all of the following are true:

- [ ] `packages/ui-react/` and `packages/account-widget-react/` carry the seven chrome components at visual parity with their Svelte siblings (ServiceBar, Sidebar, MobileTopBar, MobileBottomNav, SlideOverNav, AccountWidget, plus the Sheet primitive SlideOverNav depends on).
- [ ] aha-fast is subtree-merged into `apps/fast-{web,api}/` (or unified `apps/fast/` — see *Open question §3*) with full git history preserved.
- [ ] The fast tree converts cleanly from npm → Bun workspace (`workspace:*` for in-tree packages, `bun.lock` shared with the rest of the monorepo).
- [ ] Fast has no `Session`, `Account`, or `Verification` tables. Auth state is verified per-request by the React/Next.js equivalent of `loadHeroesAuthUser` (`lib/auth/load-fast-auth-user.ts` or equivalent), reading the portal `__session` cookie and introspecting via `GET /api/userinfo`.
- [ ] Fast has no `/login`, `/register`, `/forgot-password`, `/activate`, `/complete` routes. Better Auth surfaces (`lib/auth.ts`, `lib/auth-client.ts`, `lib/auth-server.ts`, `lib/auth-context.tsx`, `proxy.ts`) are deleted entirely.
- [ ] Fast's Next.js App is configured with `basePath: '/fast'` in `next.config.ts`. Every internal link (`<Link>`, `useRouter`, `redirect`, `fetch`) honours the base path.
- [ ] Firebase Hosting routes `/fast/**` → `coms-fast-web` Cloud Run and `/fast/api/**` → `coms-fast-api` (or single service if not split).
- [ ] `fast_profiles` table (or `user` table with `portal_sub` as PK) is the keyed-on-portal-UUID profile table per contract §2. The Better-Auth-era `id String @id` shape converts to `portal_sub` as the primary key.
- [ ] Fast appears in portal's `app_registry` via `apps/portal-api/scripts/spec07-register-fast.ts`. Cross-app navigation (portal ↔ heroes ↔ fast) works in every direction; ServiceBar surfaces fast to every other app automatically.
- [ ] Webhook consumer (`app/api/webhooks/portal/route.ts` or equivalent) handles `user.provisioned`, `user.updated`, `employment.updated`, `user.offboarded`, `taxonomy.upserted`, `taxonomy.deleted` events at minimum. Fast-specific events (`app_config.updated` for the `role` claim) gated by what fast actually consumes.
- [ ] `coms-fast-{web,api}` Cloud Run services live under per-app IaC at `infra/fast/`, mirroring `infra/heroes/`. Per-service GHA deploy workflows (`deploy-fast-web.yml`, `deploy-fast-api.yml`) with path filters + WIF auth + `db:migrate` step (mirroring portal-api's FU-3 + heroes-api's FU-5 shape) — if Prisma stays, the migrate step uses `prisma migrate deploy` or `prisma db push` as fast's convention dictates.
- [ ] Fast's PWA manifest declares `start_url`, `scope`, `id` all `/fast/` — distinct install registration from portal-web and heroes-web. Icons at the required sizes; service worker scoped to `/fast/`.
- [ ] `apps/fast-web/README.md` exists as the React-side reference doc — same shape as `apps/heroes-web/README.md`, points future React/Next.js apps at fast as the worked example.
- [ ] All existing fast functionality has zero regression. The 20+ product surfaces (analytics, channels, messages, my-request, nexus, orbit, later, activity-log, profile, fast, changelog, the routine-task flows alifm17 just shipped) all work post-cutover.

## Out of scope

- **Fast's own product feature work.** alifm17's UI commits stay. This spec doesn't refactor the analytics dashboard, the kanban, the routine-task flows, or any of the 35 product components. The integration surfaces change; the product surfaces don't.
- **Platform-owned notifications.** Fast has its own notifications today (mirrors heroes' §10 deviation). This spec preserves that. The platform-notifications work is a separate future spec.
- **Prisma → Drizzle migration.** *Maybe* in scope — see *Open question §1*. If pursued, it lives in its own phase. If not, an ADR documents the per-app exception per standing principle 1.
- **Supabase legacy retire.** Fast still references `NEXT_PUBLIC_SUPABASE_*` env vars for some legacy storage paths. The integration contract doesn't speak to this; it's a fast-internal cleanup whenever the team gets to it.
- **Google Calendar OAuth flow rewrite.** The per-user `GoogleToken` table and OAuth2 callback live inside fast and are app-internal. The base-path migration in Phase 4 may force a redirect-URI update for the OAuth callback, but the flow itself is preserved.
- **Slack webhook surface.** App-internal. Unaffected by the integration changes.
- **aha-fast's Spec 07 thread.** The user has marked the local "Spec 07" artifacts as stale; this spec does not depend on or reference them. The two scripts already in aha-coms (`apps/portal-api/scripts/spec07-{register-fast,provision-fast-orphans}.ts`) are usable tooling and survive this spec's renaming.

## Open questions (resolve before Phase 1)

These have to land in writing before code moves, because the answer reshapes the phase structure.

**All four resolved 2026-05-13.** Each landed on the recommended option below; the spec body assumes these decisions. The §1 decision additionally lives at [`docs/adr/0011-fast-keeps-prisma.md`](../adr/0011-fast-keeps-prisma.md) with explicit reopen criteria.

| Question | Decision | Status |
|---|---|---|
| §1 Prisma vs Drizzle | Option B — Keep Prisma; ADR 0011 records the exception with reopen criteria. Phase 5 defaults to skip. | Accepted 2026-05-13 |
| §2 React chrome port shape | Option B — Fold into Spec 05 Phase 1; React chrome packages port alongside fast as the live consumer. | Accepted 2026-05-13 |
| §3 Subtree-merge shape | Option A — Unified `apps/fast/`; the unified-vs-split refactor is out of scope. | Accepted 2026-05-13 |
| §4 Better Auth removal cadence | Option B — Stage in three sub-phases ((a) loadFastAuthUser alongside Better Auth, (b) flip every `requireAuth()` call site, (c) delete surfaces + schema migration). | Accepted 2026-05-13 |

### §1. Prisma vs Drizzle

Fast currently uses Prisma 5 with `prisma/schema.prisma` and `prisma db push` for migrations (no `prisma/migrations/` history — the canonical deploy path is `scripts/push-db.js`, per fast's own convention). Standing principle 8 (ADR 0008) names Drizzle as the default for the suite.

**Option A — Migrate fast to Drizzle in Phase 5.** Pros: consistency with heroes + portal; one schema-codegen story; `db:migrate` step in the deploy workflow reuses the shape established for portal-api + heroes-api. Cons: rewriting 30+ Prisma queries across `lib/`, `app/api/`, `scripts/`; risk of subtle drift on JSON column handling, default values, and relation loading.

**Option B — Keep Prisma; record the exception via ADR.** Pros: zero migration risk; alifm17's Prisma queries keep working; faster path to a working integration. Cons: two ORMs in one monorepo; the next React app onboarding gets ambiguous direction (does it follow fast's Prisma shape or heroes' Drizzle?); standing principle 8 acquires its first formal exception.

**Recommendation:** Option B for the spec's first execution, with an ADR (0011 or wherever) recording the exception and the conditions under which a future spec would migrate. The integration-contract guarantees are about wire shape and behaviour, not about the ORM. Migrating Prisma → Drizzle is a useful cleanup but it doesn't change what fast does over the wire — and pursuing it in Phase 5 lengthens the spec significantly without buying contract compliance.

### §2. React chrome port — precursor Spec 04.5, or Phase 1 of Spec 05?

The chrome packages are currently 1-line `export {}` stubs. Porting them is days-to-weeks of work and the largest single unknown in the spec.

**Option A — Precursor "Spec 04.5: React chrome packages" written and executed before Spec 05 begins.** Pros: chrome lib has its own checkpoint, can ship via React stubs without any fast-side code touched; the React variants get authored against the contract once, then consumed by fast + every future React app. Cons: two specs to manage; chrome work proceeds without a concrete consumer driving its API decisions; visual parity is harder to validate without a real React app exercising the components.

**Option B — Fold React chrome port into Phase 1 of Spec 05.** Pros: one spec; chrome variants get authored with fast as the live consumer (parity validated continuously); decisions about prop shapes get made against a concrete need, not abstractly. Cons: Spec 05 becomes substantially longer; the chrome work and the fast-side migration interleave, complicating rollback.

**Recommendation:** Option B. Spec 05's Phase 1 is the React chrome port, sealed by CP12 before any fast-side restructure begins. The chrome ports against the same component contracts heroes already proved against `@coms-portal/ui-svelte`; fast's eventual layout is one of the parity validators.

### §3. Subtree-merge shape — `apps/fast/` (unified) or `apps/fast-{web,api}/` (split)

Heroes split into `apps/heroes-web/` + `apps/heroes-api/` because heroes-api is a separate Elysia service. Fast's API lives inside the Next.js App Router (`app/api/*`) — there is no separate API service today.

**Option A — Unified `apps/fast/`.** Single Next.js app, API routes live where Next.js puts them. Cons: no path-filter isolation between web changes and API-only changes; the `db:migrate` step in the deploy workflow runs on every push that changes Next.js source.

**Option B — Split `apps/fast-web/` + `apps/fast-api/`.** Pros: mirrors heroes' shape; per-service Cloud Run for blast-radius separation. Cons: significant rework — Next.js API routes have to be extracted into a separate Elysia or hono or similar service; the unified-or-not question opens up a much larger refactor that has nothing to do with the integration contract.

**Recommendation:** Option A. Keep fast unified. Document the shape divergence from heroes as a per-app variance noted in an ADR if needed; the standing principles allow per-app exceptions when there's a real reason, and "Next.js bundles web + API in one process" is a real reason. Future React apps that DO have a separate API service can split at that point; fast doesn't, so it doesn't.

### §4. Better Auth removal — atomic or staged

Fast's auth surface is wide: 5 credential routes, the `lib/auth*` files, `proxy.ts`, 4 Prisma auth-shaped models (User has Better Auth columns; Session, Account, Verification are dedicated). Every `app/api/*` route calls `requireAuth()` from `lib/auth-server.ts`. The `auth-context.tsx` provides `useAuth()` to every authenticated component.

**Option A — Atomic cutover (one commit / one deploy window).** Pros: no parallel-auth complexity; old surface deleted in one move. Cons: huge diff; rollback means reverting the whole change; the deploy window is the only safe verification time.

**Option B — Stage in three sub-phases.** (a) Add `loadFastAuthUser` alongside existing Better Auth; (b) flip every `requireAuth()` call site to the new function while Better Auth still answers /login etc.; (c) delete Better Auth surfaces and migrate the Prisma schema. Pros: each sub-phase deploys + verifies independently; rollback boundaries are tight. Cons: parallel auth paths in tree for the duration; the Prisma `User.id` shape change (from Better Auth's `String @id` to portal-UUID-shaped) can't fully cut over until (c).

**Recommendation:** Option B. The two-table contention (User.id = better-auth-cuid vs User.portal_sub = portal-UUID) needs careful handling — a `portal_sub` column gets added first (nullable, backfilled), code flips to read it, only then does the schema migration constrain it. Mirrors the heroes path Phase 5 took with `can_submit_points`.

## Order of operations

Sequenced to keep fast deployable at every checkpoint. Don't reorder without justification.

### Phase 1: React chrome packages

The single biggest body of work in the spec. Until this lands, fast can't satisfy contract §3.

1. **Audit the seven chrome components in `packages/ui-svelte/src/chrome/` + `packages/account-widget-svelte/`** for the contract-shaped surface: prop signatures, snippet slots (which become React `children` / render-prop callbacks), event callbacks, and visual states (theme variants, mobile vs desktop responsive splits).
2. **Port the seven components to React** under `packages/ui-react/src/chrome/` and `packages/account-widget-react/src/`. Each component mirrors the Svelte prop shape but uses React idioms (children prop for snippets, `onX` callbacks for events). Tailwind classes are identical; design tokens come from `@coms-portal/design-tokens/css` exactly as in Svelte.
3. **Port the Sheet primitive** to React. Bits-ui (the Svelte primitive layer) has a React equivalent via Radix; choose Radix or a React-only headless lib that gives the same backdrop / focus-trap / ESC / slide-in shape.
4. **Author a minimal React stub consumer** (a one-page Next.js app under `packages/ui-react/examples/smoketest/` or similar) that mounts every chrome component with sample data. Confirms the props/render shape works in a real consumer before fast adopts.
5. **Visual parity check.** Side-by-side comparison against `apps/heroes-web/` and `apps/portal-web/` for each chrome component at desktop + mobile breakpoints, in light + dark mode. Capture screenshots; document any intentional divergence.

**Checkpoint 12:** React chrome packages at visual parity with their Svelte siblings. The stub consumer renders every component. `packages/ui-react/` and `packages/account-widget-react/` typecheck + build green.

### Phase 2: Subtree merge fast into the monorepo

6. **Coordinate the freeze.** Confirm `alifm17/aha-fast@main` is frozen — no incoming commits during the merge window. (User has already initiated this; reconfirm before the actual subtree command.)
7. **Subtree-merge** `aha-fast` into `apps/fast-temp/`:
   ```bash
   cd aha-coms/
   git remote add fast-source https://github.com/alifm17/aha-fast.git
   git subtree add --prefix=apps/fast-temp fast-source main --squash=false  # preserve history
   ```
8. **Restructure** `apps/fast-temp/` into `apps/fast/` (unified per *Open question §3*). Move `app/`, `components/`, `lib/`, `prisma/`, `public/`, `scripts/`, `next.config.ts`, `tsconfig.json`, etc. into `apps/fast/`. Discard `aha-fast/Dockerfile` and `cloudbuild.yaml` (they're rewritten in Phase 8); discard `aha-fast/terraform/` (replaced by `infra/fast/` in Phase 8).
9. **Rename the package.** `aha-fast/package.json` → `apps/fast/package.json` with `"name": "@coms-portal/fast"`. Sweep any in-tree `@/lib/*` import shapes that conflict with the monorepo's alias conventions.
10. **Convert npm → Bun.** Delete `package-lock.json`; add fast's deps to root `bun.lock` via `bun install` at monorepo root. Identify any npm-only behavior fast relies on (peer dep resolution quirks, `npm run` script shapes) and resolve. Update `apps/fast/package.json` scripts to use bun where bun is the natural shape (`dev`, `build`, `start`).
11. **Verify the workspace.** `bun install --frozen-lockfile` at monorepo root succeeds; `bun run --filter @coms-portal/fast dev` starts the dev server; `bun run --filter @coms-portal/fast build` produces a Next.js production build; existing fast tests (if any) pass.

**Checkpoint 13:** Fast lives in-tree at `apps/fast/`. The monorepo's workspace install + build + dev commands work for fast. Cross-package imports (eventually `@coms-portal/ui-react`, `@coms-portal/account-widget-react`, `@coms-portal/sdk`) resolve via `workspace:*`.

### Phase 3: Better Auth removal — staged per Open question §4

12. **Add `lib/auth/load-fast-auth-user.ts`** mirroring `packages/heroes-shared/src/auth/user.ts`'s shape: read the portal `__session` cookie, fetch `GET /api/userinfo` via the shared origin, upsert `User` (or `fast_profiles` — see Phase 5) keyed on the portal UUID, return the React/Next.js-shaped `AuthUser`. Next.js Server Components consume this via a Server Component wrapper; API routes consume it via a replacement for the existing `requireAuth()` helper.
13. **Add `portal_sub` column** to the Prisma `User` model as nullable. Backfill by joining on `email_normalized` against portal's `identity_users` (the canonical sentence from the integration contract §2: "PK is the portal user UUID; profile holds app-specific attributes only"). Once every active user has a `portal_sub`, the schema migration that follows constrains it.
14. **Flip every `requireAuth()` call site** in `app/api/*` to the new `loadFastAuthUser`-shaped helper. Same return shape; same authorization checks (the `user.role === 'leader'` checks remain — that's fast-internal RBAC, contract-orthogonal). The `lib/auth-context.tsx` `useAuth()` hook gets replaced by a Server Component pattern (fast's session lives on the request server-side, not in client React state).
15. **Delete the credential routes** (`app/login/`, `app/register/`, `app/forgot-password/`, `app/activate/`, `app/complete/`). Any unauthenticated user request that lands on a non-public route gets the equivalent of heroes' redirect to portal's login flow (handled in Phase 4 via `next.config.ts` middleware or per-route logic).
16. **Delete the Better Auth surfaces** (`lib/auth.ts`, `lib/auth-client.ts`, `lib/auth-server.ts`, `lib/auth-context.tsx`). Delete `proxy.ts` — Next.js middleware in the same role gets authored in Phase 4 against the new auth shape.
17. **Migrate the Prisma schema.** Drop `Session`, `Account`, `Verification` models. Drop `User.emailVerified`. Promote `User.portal_sub` to the primary key (or rename `User` → `fast_profiles` per the integration contract's `<app>_profiles` convention — depends on whether the rename is worth the cascade through Prisma relations). Run `prisma db push` against the canonical environments; this is the destructive migration that needs the deploy-first / migrate-after ordering (mirrors T46's `DROP TABLE user_config_cache` shape).

**Checkpoint 14:** Fast has no Better Auth surfaces. Every auth path runs through `loadFastAuthUser`. No `Session`, `Account`, `Verification` tables. The `User` table's primary key is the portal UUID.

### Phase 4: Single-origin migration (mount fast at `/fast/`)

18. **Configure `basePath: '/fast'`** in `apps/fast/next.config.ts`. Set `assetPrefix` accordingly so Next.js's chunk loading honours the prefix.
19. **Audit all internal links.** `<Link href="/dashboard">` → `<Link href="/dashboard">` (Next.js auto-prefixes when `basePath` is set, but any `<a href>` literals or `router.push('/...')` calls outside Next.js's awareness need manual base-path handling). Sweep `app/*` and `components/*` for raw-string paths.
20. **Audit fetch calls.** Internal `fetch('/api/...')` calls — Next.js does NOT auto-prefix `fetch`; either switch to relative fetches or use a wrapper that prepends `basePath`. The OAuth callback URLs for Google Calendar (`GOOGLE_REDIRECT_URI`) need updating to include `/fast/` — register the new redirect URI in the Google Cloud Console before cutover or OAuth breaks.
21. **Authorize the unauthenticated route logic.** Add `apps/fast/middleware.ts` (Next.js middleware, replacement for the deleted `proxy.ts`) that: (a) lets public routes (`/request`, `/track`, `/api/employees`) through, (b) for non-public routes, checks `__session` presence — if missing, redirects to portal's sign-in flow at `https://aha-coms.web.app/?redirectTo=/fast/<original-path>`. The full auth derivation runs in the page/route after the middleware; the middleware is a cheap unauthenticated-block.
22. **Update Firebase Hosting rewrites.** `firebase.json` gains routes for `/fast/**` → `coms-fast-web` and `/fast/api/**` → (same service if unified, separate Cloud Run if split). Order matters: `/fast/api/**` rewrite must come before `/fast/**` so requests route correctly.
23. **Verify locally and against a staging deploy** (or against a feature-branch GHA deploy if staging tier doesn't exist). Fast reachable at `https://aha-coms.web.app/fast/`. Sign-in from portal redirects correctly. Cross-app links (portal → fast, heroes → fast, fast → portal, fast → heroes) all work.

**Checkpoint 15:** Fast lives at `aha-coms.web.app/fast/*`. Same origin as portal + heroes. `__session` crosses paths automatically.

### Phase 5: (Optional) Prisma → Drizzle migration

**Default:** skip per *Open question §1*'s recommendation. If skipped, jump to Phase 6 after authoring `docs/adr/0011-prisma-stays-in-fast.md` (or wherever the ADR numbering lands) documenting the per-app exception with the reopen criteria (e.g., "if a third React app onboards and the ORM ambiguity becomes a real onboarding friction, revisit").

**If pursued:**

24. Author `packages/fast-shared/src/db/schema/*.ts` mirroring fast's Prisma models in Drizzle's idiom.
25. Rewrite every Prisma query call (`prisma.user.findUnique`, etc.) using Drizzle equivalents.
26. Migrate data: dump Prisma's tables, drop Prisma's metadata tables (`_prisma_migrations`), point Drizzle at the existing schema, generate a baseline migration that matches the on-disk state, apply.
27. Update the deploy workflow's migrate step from `prisma db push` to `bun --filter @coms-portal/fast db:migrate`.

**Checkpoint 16 (if pursued):** Fast uses Drizzle. The deploy workflow's migrate step is the same shape as portal-api + heroes-api.

### Phase 6: Chrome mounting

28. **Delete `components/AppShell.tsx`, `components/layout/Sidebar.tsx`, `components/layout/Header.tsx`.** Replace with React chrome from `@coms-portal/ui-react/chrome`: ServiceBar, Sidebar, MobileTopBar, MobileBottomNav, SlideOverNav (admin nav for leader role only, same gating shape as heroes), AccountWidget from `@coms-portal/account-widget-react`.
29. **Wire `data.appCatalog`.** Fast reads `apps` from the `/api/userinfo` response (via `loadFastAuthUser`), maps it through the same shape heroes does. ServiceBar surfaces every other app automatically — when a new app onboards in the future, fast's chrome surfaces it without code changes (the standing pattern from T47 Finding 5).
30. **Brand the chrome.** Render fast's brand mark (the existing "F" or app-icon shape, consistent with the gradient-square + letter pattern heroes + portal use) into the `brand` slot. Drop `theme_color`, `background_color`, manifest values from the existing fast manifest into the chrome's theme config.
31. **Visual parity with heroes + portal.** Side-by-side comparison of the chrome at desktop + mobile + light + dark, the same rigor Phase 1 used. Any divergence either gets explained (intentional fast-specific element) or fixed (drift to resolve).

**Checkpoint 17:** Fast renders the platform chrome. Contract §3 satisfied. Heroes + fast + portal share visually identical chrome corridors.

### Phase 7: App registry + webhooks

32. **Register fast via `apps/portal-api/scripts/spec07-register-fast.ts`.** The script already exists; rerun it with the post-Phase-4 URLs (`FAST_APP_URL=https://aha-coms.web.app/fast`, `FAST_WEBHOOK_URL=https://aha-coms.web.app/fast/api/webhooks/portal`, `FAST_HEALTH_CHECK_URL=https://aha-coms.web.app/fast/api/health`). Drift gets detected and upserted into `app_registry`.
33. **Author the webhook consumer.** `app/api/webhooks/portal/route.ts` (or whichever Next.js convention fits) handles `user.provisioned`, `user.updated`, `employment.updated`, `user.offboarded`, `taxonomy.upserted`, `taxonomy.deleted`. Idempotent on `event_id`; deduplicates via the `portal_webhook_events` table (mirrors heroes pattern). The handlers update fast's `User` table (or `fast_profiles`) per the integration contract §11 (profile lifecycle).
34. **Taxonomy projection.** If fast consumes any portal-owned taxonomy (branches, teams, departments), project them into a `taxonomy_cache` table (mirrors heroes' Phase 5 shape). Initial sync on registration; webhook-driven updates after.
35. **Health check endpoint.** `GET /fast/api/health` returns 200 if the DB and webhook subscription are reachable. Used by portal's dashboard probe and Cloud Run's startup probe.

**Checkpoint 18:** Fast is in `app_registry`. Cross-app navigation surfaces fast everywhere. Webhooks deliver and process correctly. Fast's profile shape stays in sync with portal's identity.

### Phase 8: Per-service IaC + deploy workflows

36. **Author `infra/fast/`.** Mirror `infra/heroes/`'s shape: per-app Tofu state bucket, Cloud Run service definitions (one or two depending on Open question §3), Artifact Registry repo, runtime SAs, monitoring filters, uptime checks, label set (`app = "fast"`, `service = "fast-web"` etc. per standing principle 4). Existing `aha-fast/terraform/` is reference material, not source-of-truth — the new IaC follows the `coms-<app>-<resource>` naming convention from standing principle 2.
37. **Author `.github/workflows/deploy-fast-{web,api}.yml`.** Path-filtered + WIF auth + `db:migrate` step (using Prisma's deploy command per Open question §1 default). Mirrors heroes' deploy workflow shape; runs the migrate BEFORE the docker build per FU-3 / FU-5 pattern. The destructive-migration ordering caveat (Phase 3 Step 17's destructive cutover) stays a manual ritual; the workflow comment names the constraint.
38. **Register fast's WIF deployer SA** (`coms-fast-deployer-sa` per standing principle 2's naming). The runtime SAs (`coms-fast-web-sa`, `coms-fast-api-sa` if split) are separate per the per-app-runtime-SA principle.
39. **First IaC apply window.** Operator runs `tofu apply` from `infra/fast/` per the laptop-CLI runbook in `infra/README.md` (FU-4). New Cloud Run services come up; first GHA deploy lands fast at the new infra.

**Checkpoint 19:** `coms-fast-{web,api}` Cloud Run services live. Deploy workflows run end-to-end. Path-filter isolation proven by a single-file probe push.

### Phase 9: PWA installability + service worker

40. **Manifest.** Add `apps/fast/public/manifest.webmanifest` (Next.js public/ is fast's static asset directory equivalent) with `start_url: "/fast/"`, `scope: "/fast/"`, `id: "/fast/"`, `display: standalone`, `theme_color` + `background_color` matching fast's brand, icons declared at 192×192 + 512×512 sizes pointing at `/fast/icons/icon-{192,512}.png`. Icons generated via the same ImageMagick pattern FU-6 used for portal-web + heroes-web — fast-branded variant (indigo/purple gradient + "F" letter, per fast's existing brand colors).
41. **Service worker.** Add `apps/fast/public/service-worker.js` (or Next.js's preferred SW shape) mirroring portal-web's pattern: cache `[build, files]` on install, prune stale caches on activate, cache-or-network on fetch with the API skip-guard reshaped for `/fast/api/*`.
42. **Lighthouse PWA audit.** Run against `https://aha-coms.web.app/fast/` post-deploy. Fix whatever the audit flags. Operator on-device install verification: install fast as PWA from phone, open from home screen, confirm splash + icon + standalone chrome render.

**Checkpoint 20:** Fast is installable as a distinct PWA from portal-web and heroes-web. Three install registrations live on the shared origin, scoped by start_url.

### Phase 10: Verification + documentation

43. **End-to-end smoke (mirrors T47's checklist):**
    - Sign in via portal → land on fast (when portal links to fast).
    - Navigate within fast, between apps (fast ↔ heroes ↔ portal), between routes.
    - Logout from one app → verify logged out everywhere.
    - Mobile chrome: install PWA, log in, verify chrome looks identical to portal's + heroes'.
    - Admin operations: fast's leader-only views (analytics, user control panel) work post-cutover.
    - Public surfaces: `/fast/request` + `/fast/track` + `/fast/api/employees` reachable without authentication.
    - Google Calendar OAuth: connect, list events, create meeting — all green after the redirect-URI update.
    - Slack webhook: submit a request, confirm Slack delivery.
44. **Performance check.** Heroes-style p50/p95 capture; expected flat-or-faster than pre-migration fast given the per-request `__session` introspection vs Better Auth's session-row lookup is approximately the same wire cost.
45. **Author `apps/fast/README.md`** as the React-side reference doc. Same structure as `apps/heroes-web/README.md`: the loadFastAuthUser narrative, the explicit anti-patterns fast deliberately doesn't carry, the integration-contract cross-reference table mapping each § to fast's concrete file path. Pair it with a "future React/Next.js app onboarding" coda — the next React app reads fast's README the way the next Svelte app reads heroes'.
46. **Update `docs/integration-contract.md`** to reference fast alongside heroes wherever heroes is named as the reference implementation. Both apps now satisfy §§ 1–9 + 11–14; the contract gains a second worked example.

**Checkpoint 21:** Spec 05 complete. Fast is the React-side reference implementation. Heroes + fast together prove framework parity in code. The monorepo holds two production apps end-to-end on the contract.

## Risks worth tracking

| Risk | Phase | Likelihood | Mitigation |
|---|---|---|---|
| React chrome port produces a visual or behavioural divergence from Svelte parity | Phase 1 | High | Pixel-level comparison at every breakpoint + theme. The Svelte version is the authority; React mirrors. Author a stub consumer early to validate prop shapes. |
| Better Auth removal leaves some `requireAuth()` call site unconverted, causing a 401 in prod | Phase 3 | High | Grep `requireAuth\|getServerSession\|useAuth` across the tree before deploy; every call site must flip. Stage the cutover (Open question §4 Option B) so any miss fails fast in the (b) sub-phase, not after the (c) drop. |
| Next.js `basePath: '/fast'` breaks scattered absolute paths | Phase 4 | High | Audit thoroughly: `grep -rn 'href="/' apps/fast/`, `grep -rn 'fetch("/' apps/fast/`, `grep -rn "router.push('/'" apps/fast/`. Each result reviewed. |
| Google Calendar OAuth redirect URI mismatch after base-path change | Phase 4 | Medium | Register the new redirect URI in Google Cloud Console BEFORE the deploy that flips `basePath`. Old URI stays registered through one rollback window. |
| Prisma → Drizzle migration introduces query-shape regression | Phase 5 (if pursued) | Medium | Default is to skip; recommendation Option B in Open question §1 keeps Prisma. If pursued, dual-shape testing per query family. |
| Two install registrations on the shared origin collide if scope is misconfigured | Phase 9 | Medium | Verify `start_url` + `scope` + `id` are all `/fast/` (heroes uses `/heroes/`, portal uses `/`). Lighthouse PWA audit catches scope misconfiguration. |
| The 30+ alifm17 UI commits introduce surfaces this spec didn't audit | All phases | Medium | Re-audit after subtree merge in Phase 2. The PROJECT_CONTEXT.md was last updated 2026-03-31; the tree shape evolved since. Phase 2 step 11 verifies fast still builds; subsequent phases discover anything that broke. |
| Spec 02's chrome corridor decisions don't transfer cleanly to React | Phase 1 + Phase 6 | Low | The chrome contract is framework-agnostic (props + slots + events). The React port mirrors the contract, not the implementation. If a Svelte-specific pattern doesn't translate (e.g., `$derived`), the React variant uses the React-idiomatic equivalent (`useMemo`, server-side derivation). |
| Webhook consumer's idempotency fails under retry storms during the cutover deploy | Phase 7 | Low | The `portal_webhook_events` dedup table follows heroes' pattern. Pre-deploy: confirm the table exists and the unique-key constraint is enforced. |

## Verification

After each phase's checkpoint:

- `bun install --frozen-lockfile` succeeds at monorepo root.
- `bun run typecheck` passes for affected packages.
- `bun run test` passes where tests exist.
- `bun run build` produces a clean Next.js build for `apps/fast`.
- Manual smoke against staging or feature-branch deploy where the change is user-visible.
- Visual parity check at chrome-touching phases (1 + 6 + 9).
- Cross-app navigation verification at registry-touching phases (7).

## When this spec is done

Heroes (Svelte) and fast (React/Next.js) together satisfy contract §§ 1–9 + 11–14 in code. The integration contract gains its second worked example. The React chrome packages (`packages/ui-react/`, `packages/account-widget-react/`) are production-validated. The next React app onboarding reads:

1. `docs/integration-contract.md`
2. `apps/fast/README.md` as the React-side canonical example
3. `apps/heroes-web/README.md` as the cross-framework parity reference
4. The relevant ADRs (especially 0002 cross-framework UI fork, now proved out)

…and produces an integration that matches the same pattern, without re-litigating the architecture.

### Known deviation: notifications

Fast retains an app-local notifications implementation after this spec completes (mirrors heroes' §10 deviation). The platform-owned notifications spec is the canonical future home for both apps' notifications. Until then, new React apps onboard **without** copying fast's notification code — the deviation is documented, not exemplified.

### What this spec is *not*

This is not a refactor of fast's product surfaces. The kanban, the analytics, the routine-task flows, the google-calendar integration shape — none of those change. Only the integration surfaces (auth, chrome, app-registration, deploy pipeline, base-path mount) reshape to satisfy the contract. alifm17's product work survives the migration intact.
