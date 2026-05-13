# heroes-web

The AHA Heroes web app — gamification (points, rank, leaderboard) layered over
portal-owned identity. SvelteKit + Bun, mounted at `/heroes/*` on the shared
COMS origin (`aha-coms.web.app` in prod).

**This app is the reference implementation of the COMS integration contract**
for §§ 1–9 and §§ 11–14. The platform-owned notifications corridor (§10)
remains the documented suite-wide deviation, awaiting the
platform-notifications spec. If you are building a new COMS app, read
[`docs/integration-contract.md`](../../docs/integration-contract.md) first,
then study this app and `apps/heroes-api/` as the worked example.

## Running locally

```bash
bun run dev:heroes-web
```

The wrapper at `scripts/dev-heroes-web.sh` sources
`apps/heroes-api/.env` before invoking `vite dev` — bun's `--filter`
cwd-switch happens after bun loads its own env, so heroes-web's symlinked
`.env` would otherwise miss `DATABASE_URL` and crash on first authed-route
SSR. The wrapper is the supported invocation; do not call `bun run --filter
@coms-portal/heroes-web dev` directly unless you are intentionally testing
the env-loading gap.

Backend (`heroes-api`) runs separately:

```bash
bun run dev:heroes-api
```

## Build and typecheck

```bash
bun run --filter @coms-portal/heroes-web build
bun run --filter @coms-portal/heroes-web typecheck
```

The build runs `paraglide-js compile` first (i18n message catalogue → typed
modules under `src/lib/paraglide/`), then `vite build` produces the
`build/` directory consumed by `svelte-adapter-bun` at deploy time.

## Architecture in one paragraph

heroes-web is a SvelteKit app with `kit.paths.base = '/heroes'`
(`svelte.config.js:7`). Every internal link, `goto()`, `redirect()`, and
`fetch()` flows through `$app/paths` `base`, so the app round-trips through
its mount point without leaking root-relative URLs. Firebase Hosting
forwards `/heroes/**` to `coms-heroes-web` Cloud Run and `/heroes/api/**`
to `coms-heroes-api`, both running in the same GCP project as portal-web
and portal-api. The whole suite lives on one origin — there is no
cross-domain handoff, no broker exchange, no app-side OAuth callback.

## The auth flow — the contract every new app should mirror

heroes-web does NOT mint sessions, hold credentials, or maintain a session
table. The full auth path is three artefacts:

1. **Portal owns the session.** The user signs in at portal-web; portal
   sets the `__session` cookie at the shared origin. Firebase Hosting
   filters every incoming cookie except `__session` before forwarding to
   Cloud Run — so `__session` is the only signal heroes-web ever sees.
   No `coms_session` cookie, no app-local mint.

2. **`loadHeroesAuthUser` introspects.** On every authenticated request,
   `packages/heroes-shared/src/auth/user.ts` calls `GET /api/userinfo`
   on portal-api with the `__session` cookie attached. Portal-api
   validates the cookie server-side (it's an opaque UUID — `auth_sessions.id`
   — not a JWT; see the note below) and returns
   `{ sub, name, email, portalRole, apps: [{slug, label, url}, ...] }`.

3. **Heroes upserts its own row.** `loadHeroesAuthUser` upserts
   `heroes_profiles` keyed on the portal UUID, then reads back the
   heroes-specific fields (`role`, `canSubmitPoints`, branch/team
   snapshots). One HTTP fetch + one upsert + one read + one opportunistic
   `email_cache` write per request. The auth-path table touches reduced
   from 2 tables (heroes_profiles ⋈ user_config_cache) to 1 in Phase 5
   (T44–T46).

Wired in two places:

- `apps/heroes-web/src/hooks.server.ts` calls `loadHeroesAuthUser` for
  SSR-side auth and stashes the result on `event.locals` for the
  `(authed)` route group to consume via `+layout.server.ts`.
- `apps/heroes-api/src/middleware/auth.ts` calls the same function for
  API requests, so the web and API surfaces share one auth derivation.

### A note on ADR 0005 vs reality

[ADR 0005](../../docs/adr/0005-jwt-stateless-sessions.md) framed Phase 2
as "verify portal-minted JWTs via `@coms-portal/sdk`". The CP6
verification cycle (T31, 2026-05-12) found that portal's `__session` is
an opaque session-id cookie, not a JWT — SDK-side JWT verification does
not apply. The contract that lives in the code is the
`/api/userinfo` response shape, not a JWT claim set; the underlying
guarantee (stateless on the heroes side, no local session table) is
identical. The ADR's "drop local auth tables, no local mint, portal owns
session lifetime" decisions stand verbatim. If the platform later moves
to JWTs, `loadHeroesAuthUser` is the single seam to update.

## What this app deliberately does NOT carry

These are anti-patterns from §1 of the integration contract. The
references below are kept so future grep'ing for them returns to this
README, not to dead code:

- **No `session`, `account`, or `verification` tables.** Dropped at T36
  via migration `0016_drop_legacy_auth_tables.sql` after the
  `getLocalSessionByToken` family retired in T35. The
  `packages/heroes-shared/src/db/schema/auth.ts` file is gone; its
  re-exports and typebox helpers are gone with it.
- **No `/auth/portal/exchange` route.** T38 audited it; T39 deleted the
  route directory. The single-origin migration (CP6) made the
  cross-domain handoff that justified the broker unnecessary. Any
  legacy portal redirects that still attach `?portal_code=…` arrive on
  the new routes and are ignored.
- **No `/login`, `/register`, `/forgot-password`, `/verify-email`
  routes.** Unauthenticated requests hit `(authed)/+layout.server.ts`,
  see no resolved user, and redirect to portal's login flow.
- **No `password`, `email_verified`, `provider_id` columns** anywhere
  in `heroes_profiles`. Identity comes from `/api/userinfo`; the
  profile holds gamification state plus denormalized HR snapshots only.
- **No `coms_session` cookie writes.** Heroes-web never sets a session
  cookie. The legacy `Cache-Control: private, no-store` cluster on
  cookie-write handlers retired with the routes that used it.
- **No hardcoded app catalog.** ServiceBar and AccountWidget launcher
  both derive from `data.appCatalog` (the `apps` array returned by
  `/api/userinfo`, with the COMS hub prepended in `apps/portal-api/src/
  routes/userinfo.ts`). A new app onboarding requires zero changes in
  heroes-web's layout — see T47 Finding 5 for the principle.

## What heroes-web owns

- **Heroes-specific routes.** Dashboard, points submission, rank,
  leaderboard, admin pages (users, settings, audit log, sheet sync,
  reports). Admin loads use direct service imports from
  `@coms-portal/heroes-api/services/*` rather than HTTP round-trips —
  see T47 Finding 1 for why same-origin `event.fetch('${base}/api/v1/...')`
  is the wrong shape post-Phase-1.
- **Heroes branding inside the platform chrome.** The brand mark
  (gold-gradient square + Trophy icon + "AHA HEROES" wordmark) is
  rendered into the `brand` snippet slot of the platform chrome
  components from `@coms-portal/ui-svelte`. The chrome shell, app
  switcher, mobile nav, slide-over admin menu, and account widget all
  come from shared libs.
- **PWA installability for `/heroes/`.** Manifest at
  `static/manifest.webmanifest` declares `start_url`, `scope`, and `id`
  of `/heroes/` so Chrome treats heroes-web as a distinct installable
  PWA from portal-web. Icons at `static/icons/icon-{192,512}.png`.
  Service worker at `src/service-worker.ts` mirrors portal-web's
  cache-on-install pattern, with the API skip-guard reshaped for
  `/heroes/api/*`. See [FU-6 in `tasks/todo.md`](../../tasks/todo.md)
  for the installability audit + fix.

## Integration contract cross-reference

| Contract section | heroes-web's anchor |
|---|---|
| §1 Authentication and session | `packages/heroes-shared/src/auth/user.ts` (`loadHeroesAuthUser`), `hooks.server.ts`, `(authed)/+layout.server.ts` |
| §2 User identity | `heroes_profiles` table at `packages/heroes-shared/src/db/schema/users.ts`; PK is the portal user UUID, no `defaultRandom` |
| §3 Chrome and account widget | `(authed)/+layout.svelte` mounts `ServiceBar`, `Sidebar`, `MobileTopBar`, `MobileBottomNav`, `AccountWidget`, `SlideOverNav` — all from `@coms-portal/ui-svelte/chrome` and `@coms-portal/account-widget-svelte` |
| §4 Design tokens | `@coms-portal/design-tokens/css` imported via the global stylesheet; the lint rule in CI blocks raw hex literals |
| §5 App registry + manifest | `apps/portal-api/scripts/register-heroes.ts` upserts heroes' `app_registry` row at deploy time |
| §6 Webhooks | `apps/heroes-api/src/routes/webhooks/portal.ts` (consumer); event handlers under `services/portal-events/` |
| §7 SDK consumption | `import { … } from '@coms-portal/sdk'` — no app-local re-implementations |
| §8 Logout propagation | `AccountWidget` calls `signOut()` from `@coms-portal/account-widget-svelte`, which redirects to portal's `/logout`; portal clears `__session` and the user is logged out of every app |
| §9 Same-origin chrome | `kit.paths.base = '/heroes'` + Firebase Hosting rewrites — see [ADR 0003](../../docs/adr/0003-single-origin-pwa.md) and [ADR 0004](../../docs/adr/0004-firebase-hosting-routing.md) |
| §10 Notifications | **Documented deviation.** Awaiting platform-notifications spec |
| §11 Profile lifecycle | `loadHeroesAuthUser` upsert is the first-login path; `user.offboarded` webhook handler marks `is_active = false` (no row deletion) |
| §12 Org taxonomies | `taxonomy_cache` projected from `taxonomy.upserted` / `taxonomy.deleted` webhooks; heroes denormalizes `(key, value_snapshot)` pairs onto `heroes_profiles` |
| §13 Email handling | `email_cache` table populated opportunistically from `/api/userinfo` response; no `email` column on `heroes_profiles` |
| §14 Deployment surface | `.github/workflows/deploy-heroes-web.yml` (path-filtered, deploys to `coms-heroes-web` Cloud Run); `db:migrate` runs as a step inside `deploy-heroes-api.yml` (see FU-5 in `tasks/todo.md`) |

## Pointers

- [`docs/integration-contract.md`](../../docs/integration-contract.md) — the binding rulebook
- [`docs/spec/02-heroes-cleanup.md`](../../docs/spec/02-heroes-cleanup.md) — the cleanup spec heroes executed against
- [`docs/adr/0003-single-origin-pwa.md`](../../docs/adr/0003-single-origin-pwa.md) — why `/heroes/*` and not `heroes.coms.com`
- [`docs/adr/0005-jwt-stateless-sessions.md`](../../docs/adr/0005-jwt-stateless-sessions.md) — the stateless-on-the-app-side decision (read alongside the §"ADR 0005 vs reality" note above)
- [`docs/adr/0006-gip-only-auth.md`](../../docs/adr/0006-gip-only-auth.md) — the GIP credential source whose sessions heroes accepts
- [`apps/heroes-api/README.md`](../heroes-api/README.md) — the backend service it pairs with
- [`tasks/plan.md`](../../tasks/plan.md) and [`tasks/todo.md`](../../tasks/todo.md) — the in-flight execution record

## When the next app onboards

Use this app as the template. Specifically:

1. SvelteKit (or Next.js) with `paths.base = '/<app>'`.
2. Single auth derivation (mirror `loadHeroesAuthUser` in your shared
   package — read `__session`, hit `/api/userinfo`, upsert
   `<app>_profiles`, return the result).
3. Chrome from `@coms-portal/ui-svelte/chrome` (or `@coms-portal/ui-react/chrome` for React apps).
4. Register your app via `apps/portal-api/scripts/register-<app>.ts` at
   deploy time — that publishes your `app_registry` row, healthcheck URL,
   and webhook endpoint so portal can route events to you and ServiceBar
   surfaces you to every other app's chrome automatically.
5. Read `data.appCatalog` for cross-app links — never hardcode app slugs.

If you find yourself diverging from any of the above, write an ADR
documenting the deviation before merging. Silent drift is a bug.
