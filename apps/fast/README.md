# fast

The AHA Smart Tracker — task management, routine-task scheduling, team
chat, and admin workflow tools. Next.js 16 + Prisma + Bun, deployed as
a single Cloud Run service (`coms-fast-web`) mounted at `/fast/*` on
the shared COMS origin (`aha-coms.web.app` in prod).

**This app is the React-side reference implementation of the COMS
integration contract.** Heroes-web (SvelteKit) is the Svelte-side
reference; fast is the React-side counterpart. Together they prove the
contract is framework-orthogonal — the same primitives (single-origin
chrome, JWT-less `__session` introspection, single auth derivation,
shared design tokens, declarative app registry, ID-token-verified
webhooks) work identically on either runtime. If you are building a
new React COMS app, read
[`docs/integration-contract.md`](../../docs/integration-contract.md)
first, then study this app as the worked example.

Brownfield context: fast was a standalone Next.js app
(`aha-fast`/`aha-fast-app`) before Spec 05 onboarded it onto the COMS
contract. The Better Auth surface that survived from that era was
retired in Phase 3 (T60–T64); the legacy run.app URLs flipped to
single-origin in Phase 4 (T65–T70); the platform chrome mounted in
Phase 6 (T72–T75); webhooks went live in Phase 7 (T76–T79); PWA
installability in Phase 9 (T84–T86). The standalone-era repo at
`/Users/mac/HT/AHA COMS/aha-fast/` is reference material; the
in-tree version under `apps/fast/` is the canonical source.

## Running locally

```bash
bun run --filter @coms-portal/fast dev
```

Reads from `apps/fast/.env` (see `.env.example` for the full surface;
`PORTAL_SERVICE_ACCOUNT_EMAIL` + `SELF_PUBLIC_URL` + `PORTAL_BASE_URL`
are the additions T77 / T78 introduced for webhook verification and
the taxonomy sync).

The dev server starts on port 3000 by default; Next.js' basePath of
`/fast` means local URLs land at `http://localhost:3000/fast/...`. To
test the cookie corridor end-to-end you need a `__session` from
portal — sign in via portal-web first, then visit the local fast URL
with the cookie attached.

## Build, typecheck, and tests

```bash
bun run --filter @coms-portal/fast build       # next build
bun run --filter @coms-portal/fast typecheck   # tsc --noEmit

# Tests run per-file because Bun's mock.module() is process-global
# and fast's mocks would cross-contaminate inside a single process:
bun test ./apps/fast/lib/portal/*.test.ts \
         ./apps/fast/app/api/webhooks/portal/route.test.ts \
         ./apps/fast/app/api/health/route.test.ts \
         ./apps/fast/lib/auth/load-fast-auth-user.test.ts
```

`tsconfig.json` excludes `**/*.test.ts` from typecheck so test-only
`mock.module` calls don't leak `@types/bun` into Next.js' tsserver pass.

## Architecture in one paragraph

Next.js App Router with `basePath: '/fast'` + `output: 'standalone'`
(`next.config.ts`). Middleware at `apps/fast/middleware.ts` enforces
the auth cookie on every page request that's not on the
`PUBLIC_PATH_PREFIXES` allowlist (`/request`, `/track`, `/api/employees`,
`/api/auth/google/callback`, `/api/webhooks`, `/api/cron`, `/api/health`,
`/api/heartbeat`). Server Components and Route Handlers reach
`loadFastAuthUser` from `apps/fast/lib/auth/load-fast-auth-user.ts` to
derive the request's `AuthUser` from the portal `__session` cookie.
Prisma (with explicit `binaryTargets = ["native", "debian-openssl-1.1.x",
"debian-openssl-3.0.x"]` for the multi-stage Docker build) talks to
fast's Cloud SQL Postgres instance (`aha-fast-db-instance-cd5db712`,
separate from portal's instance). Firebase Hosting forwards
`/fast/**` to `coms-fast-web` Cloud Run; everything lives on
`aha-coms.web.app`, no cross-domain handoff.

## The auth flow — the contract every new React app should mirror

Fast does NOT mint sessions, hold credentials, or maintain a session
table. The full auth path is three artefacts:

1. **Portal owns the session.** The user signs in at portal-web; portal
   sets the `__session` cookie at the shared origin. Firebase Hosting
   filters every incoming cookie except `__session` before forwarding
   to Cloud Run — so `__session` is the only signal fast ever sees.
   No `coms_session` cookie, no app-local mint.

2. **`loadFastAuthUser` introspects.** On every authenticated request,
   `apps/fast/lib/auth/load-fast-auth-user.ts` calls
   `GET /api/userinfo` on portal-api with the `__session` cookie
   attached. Portal-api validates the cookie server-side (it's an
   opaque UUID — `auth_sessions.id` — not a JWT; see the heroes-web
   README's ADR-0005-vs-reality note) and returns
   `{ sub, name, email, portalRole, apps: [{slug, label, url}, ...] }`.

3. **Fast upserts its own row.** `loadFastAuthUser` upserts `User`
   keyed on `portal_sub` (added by the T60 migration as a nullable +
   unique column), then returns `{ user, appCatalog }`. One HTTP fetch
   + one Prisma upsert per request — no second-table JOIN today, since
   fast's `User` carries all in-line identity (`role`, `teamId`,
   `image`) instead of denormalizing across a profile/email/config
   trio the way heroes did pre-Phase-5.

Wired in two places:

- **Server Components + Route Handlers** call `loadFastAuthUser`
  directly with the cookie value pulled from `cookies().get('__session')`.
- **The `/api/auth/me` route** (`app/api/auth/me/route.ts`) wraps the
  same call into a 200 JSON response the client `useAuth` hook
  (`apps/fast/lib/auth/use-auth.tsx`) fetches on mount. Client-side
  components consume the resolved `FastSession` from the React
  context, never the cookie directly.

## What this app deliberately does NOT carry

These are anti-patterns from §1 of the integration contract. The
references below are kept so future grep'ing for them returns to this
README, not to dead code:

- **No `session`, `account`, or `verification` tables.** Dropped at
  T64 via `apps/fast/prisma/sql/0002_drop_better_auth_tables.sql`
  after the `requireAuth`/`getServerSession` family retired in
  T61–T63. `User.emailVerified` dropped in the same migration.
- **No `/api/auth/sign-up`, `/api/auth/sign-in`, `/api/auth/sign-out`,
  `/api/auth/forgot-password`, `/api/auth/reset-password` routes.**
  T62 deleted the five credential routes; sign-in flows through
  portal's login, sign-out flows through AccountWidget's helper.
- **No `lib/auth.ts` Better Auth client.** T63 deleted the four auth
  lib files and `proxy.ts`. The shape that replaced them is one
  middleware + one `loadFastAuthUser` call site per Server Component.
- **No hardcoded app catalog in chrome.** `data.appCatalog` flows
  from `/api/auth/me`'s response, which derives it from
  `loadFastAuthUser`'s `apps` projection. A new app onboarding requires
  zero changes in fast's `TopNav` cross-app pills — the per-pill list
  lifts from the auth payload on every render (with a static fallback
  rendered pre-auth so the row never looks empty on first paint).
- **No `email_verified`, `provider_id`, `password_hash` columns**
  anywhere in `User`. Identity comes from `/api/userinfo`; the row
  holds fast-specific state (`role`, `teamId`, `lastSeenAt`,
  `accountStatus`) only.

## What fast owns

- **Task management.** The Smart Tracker primitive — task creation,
  assignment, status transitions, time tracking, project membership.
  Core schema at `Task`, `Project`, `TaskComment`, `TaskReview`,
  `TaskDelegation`, `ChecklistItem` in `prisma/schema.prisma`.
- **Routine task scheduling.** The AHA ORBIT module — templated
  recurring tasks (`RoutineTaskTemplate`), per-checklist-item claims
  (`ChecklistItem` with `claimedById`), and the routine-scheduler
  cron at `lib/routine-scheduler.ts`.
- **Team chat + DMs.** Channels (`Channel`, `ChannelMessage`,
  `ThreadReply`), direct messages (`Conversation`, `DirectMessage`),
  reactions (`MessageReaction`, `DmReaction`), saved messages,
  read-status tracking, custom emojis. Realtime via Postgres
  LISTEN/NOTIFY through the routes under `app/api/chat/`.
- **Admin surfaces.** User management (`app/users/page.tsx`),
  team settings (`app/admin/teams/`), audit log (`ActivityLog`
  model + `app/api/activity-log/`), changelog publishing
  (`ChangelogEntry`).
- **Public-facing task request + tracking.** `/request` (anonymous
  task submission) + `/track` (anonymous tracking by reference code).
  Both on the `PUBLIC_PATH_PREFIXES` allowlist; the page-level guard
  enforces the rate limit + spam filtering.
- **Fast-branded chrome integration.** ServiceBar from
  `@coms-portal/ui-react` mounted above fast's in-app TopNav on
  desktop (hidden on `<md`); AccountWidget from
  `@coms-portal/account-widget-react` in the ServiceBar's right slot.
  Fast's brand mark (`"F"` gradient) is the BrandSlot value; in-app
  surfaces (notifications bell, module tabs, toast popups) stay in
  fast's own TopNav, which is per-app domain.
- **PWA installability for `/fast/`.** Manifest at
  `app/manifest.ts` declares `start_url`, `scope`, and `id` of `/fast/`
  so Chrome treats fast as a distinct installable PWA from portal-web
  and heroes-web. Icons at `public/icons/...`. Service worker at
  `public/sw.js` (registered from `components/PWAInstaller.tsx`)
  mirrors portal-web's cache-on-install pattern, with the API
  skip-guard reshaped for `/fast/api/*`.

## Portal webhook consumer (T77 + T78)

`POST /fast/api/webhooks/portal` consumes events portal dispatches via
the at-least-once delivery shape. The implementation lives in
`apps/fast/lib/portal/` mirroring heroes' `apps/heroes-api/src/services/
portal-events/` adapted for Next.js + Prisma:

- **OIDC verification** via `google-auth-library`'s `OAuth2Client`
  (`lib/portal/oidc.ts`) against `PORTAL_SERVICE_ACCOUNT_EMAIL` +
  `SELF_PUBLIC_URL`. The audience portal mints is
  `new URL(endpoint.url).origin` — the bare Firebase Hosting origin,
  NOT the basePath-prefixed serving URL. FU-24 records the
  audience-mismatch trap.
- **Envelope unwrap** via `lib/portal/unwrap-envelope.ts` — never pass
  the full `PortalWebhookEnvelope<T>` to handlers; always unwrap to
  `envelope.payload`. Heroes' 2026-05-05 regression anchors this
  rule.
- **Idempotency** via the `PortalWebhookEvent` Prisma model
  (`event_id` PK). `createMany({ skipDuplicates: true })` short-circuits
  to 200 before any handler runs on the dedup hit.
- **Eight subscribed events** (see
  `apps/portal-api/scripts/spec07-register-fast.ts`):
  `user.provisioned`, `user.updated`, `user.offboarded`,
  `employment.updated`, `app_config.updated`, `alias.updated`,
  `taxonomy.upserted`, `taxonomy.deleted`. Per-event handlers in
  `lib/portal/handlers/`; the four with concrete fast-side projections
  do real work, the two without (`employment.updated`,
  `alias.updated`) sit as deliberate no-ops with reasons inline.
- **Role mapping** via `lib/portal/role-mapping.ts` —
  `mapPortalRoleToFastRole()` normalises portal's
  `'employee' | 'leader' | 'admin'` to fast's
  `'member' | 'leader' | 'admin'` column convention.

The companion `TaxonomyCache` Prisma model projects portal-owned
taxonomies (currently just `'teams'`) for fast-side lookup. Initial
seed via `apps/fast/scripts/sync-taxonomies.ts` (calls portal-api's
`/api/taxonomies/sync` via SA-impersonated ID token); subsequent
updates ride the `taxonomy.upserted`/`taxonomy.deleted` webhooks.

## Migrations

```bash
bun run --filter @coms-portal/fast db:generate   # prisma generate
bun run --filter @coms-portal/fast db:push       # prisma db push
```

`deploy-fast.yml` runs `prisma db push` automatically before building
the image, via cloud-sql-proxy + the prod URL secret `aha-fast-db-url`.
The destructive-migration caveat carries from heroes-api: a `DROP
TABLE` shape (T64's drop of Session/Account/Verification is the
canonical exception) needs deploy-first / migrate-after ordering
instead; include `[skip-db-push]` at the END of the commit's SUBJECT
LINE (FU-23 — body prose mentioning the token no longer trips it) to
bypass the `db:push` step and run the destructive SQL manually via
Cloud SQL Auth Proxy. The workflow comment at
`.github/workflows/deploy-fast.yml:102` names this escape hatch.

SQL files for destructive shapes live in `apps/fast/prisma/sql/`:

- `0001_add_portal_sub.sql` — T60's nullable `portal_sub` column + unique
  constraint (sealed 2026-05-13 + revised 2026-05-14 after the partial-
  unique-index trap).
- `0002_drop_better_auth_tables.sql` — T64's destructive cut applied
  2026-05-14 via the CP14→CP20 runbook.

## Where the surfaces live

- **Pages** — `app/` (App Router): `dashboard/`, `tasks/`, `messages/`,
  `nexus/`, `orbit/`, `track/`, `users/`, `request/`, `team-inbox/`,
  `admin/`, `profile/`. Most pages are server-rendered and call
  `loadFastAuthUser` at the top of the `(authed)` layout.
- **Route handlers** — `app/api/`: `auth/`, `tasks/`, `chat/`,
  `meetings/`, `notifications/`, `webhooks/portal/` (T77),
  `health/` (T79), `users/`, `admin/`, `teammates/`, `nexus/`,
  `orbit/`, `dashboard/`, `request/`, `slack/`, `cron/`, etc.
- **Auth library** — `lib/auth/load-fast-auth-user.ts` (server-side
  derivation), `lib/auth/use-auth.tsx` (client-side React context).
- **Portal bridge** — `lib/portal/`: `oidc.ts`,
  `unwrap-envelope.ts`, `role-mapping.ts`, `dispatch.ts`,
  `portal-api-client.ts`, `handlers/handle-*.ts`.
- **Middleware** — `middleware.ts` (T68): auth-cookie check with
  public-path allowlist.
- **Chrome integration** — `components/AppShell.tsx`,
  `components/layout/TopNav.tsx`, `components/layout/Sidebar.tsx`,
  `components/layout/BottomNav.tsx`.
- **Health checks** — `/fast/api/health` (T79); Cloud Run startup
  + liveness probes + portal dashboard probe.

## Integration contract cross-reference

| Contract section | fast's anchor |
|---|---|
| §1 Authentication and session | `apps/fast/lib/auth/load-fast-auth-user.ts` (`loadFastAuthUser`); `apps/fast/middleware.ts` (PUBLIC_PATH_PREFIXES allowlist); `apps/fast/app/api/auth/me/route.ts` |
| §2 User identity | `User` model at `apps/fast/prisma/schema.prisma`; PK is currently `id` (legacy Better-Auth string), bridged to portal via `portal_sub @unique`. PK promotion to `portal_sub` deferred per T64's cascade scope |
| §3 Chrome and account widget | `components/AppShell.tsx` mounts `TopNav` + `Sidebar` + `BottomNav`. `TopNav` carries cross-app pills + an inline account popover after the 2026-05-15 header consolidation (PR #6); the shared `@coms-portal/ui-react` `ServiceBar` and `@coms-portal/account-widget-react` `AccountWidget` are not mounted in fast — an inline popover sidesteps the shared widget's hardcoded `fixed top-9 right-3` offset that assumed a separate 36px-tall ServiceBar above the TopNav |
| §4 Design tokens | `@coms-portal/design-tokens` imported via `app/globals.css`; brand palette + spacing primitives flow through Tailwind v4's `@source` registration |
| §5 Routing and base path | `next.config.ts` `basePath: '/fast'` + `assetPrefix`; `middleware.ts` matches against `req.nextUrl.pathname` (Next.js strips the basePath in middleware context) |
| §6 Real-time and chat | Postgres LISTEN/NOTIFY through `app/api/chat/` routes; no public WebSockets, no SSE (chat uses long-polling today; SSE swap deferred) |
| §7 ORM and data layer | Prisma (per [ADR 0011](../../docs/adr/0011-fast-keeps-prisma.md)); schema at `prisma/schema.prisma`; client at `lib/db.ts` |
| §8 Deploys | `.github/workflows/deploy-fast.yml` (single unified workflow — path-filtered, WIF auth, `prisma db push` step gated on subject-line `[skip-db-push]` token); IaC at `infra/fast/` (Cloud Run + WIF + monitoring + Artifact Registry) |
| §9 PWA and service worker | `app/manifest.ts` declares `start_url`/`scope`/`id` of `/fast/`; `public/sw.js` carries the cache + API skip-guard pattern, registered from `components/PWAInstaller.tsx` |
| §10 Notifications | **Documented deviation.** Mirrors heroes' deviation — awaiting platform-notifications spec. Fast uses an in-app notifications table + Resend for transactional email today |
| §11 Portal webhooks | `app/api/webhooks/portal/route.ts` + `lib/portal/` (T77 + T78). All eight subscribed events handled; per-event handlers in `lib/portal/handlers/`. `PortalWebhookEvent` PK for idempotency; `TaxonomyCache` for taxonomy projection |
| §12 Internationalization | Single-locale (en-US) — fast does not internationalize. Suite default locale carried through portal's chrome strings |
| §13 Observability and logging | Cloud Run stdout; structured logs via `pino` are the convention but fast's existing surfaces use `console.*` — migration deferred (no FU filed yet) |
| §14 Build and runtime tooling | Bun for install + workspace orchestration; Node.js 20-bullseye-slim runtime in the Docker image (Prisma 5.22 wants OpenSSL 1.1.x; the runtime stage pins to bullseye for libssl); `next start` serves the standalone output |

## Operator runbook

See [`docs/runbook-cp14-cp20-window.md`](docs/runbook-cp14-cp20-window.md)
for the seven-step CP14→CP20 walk — deploy → register → destructive
Prisma apply → authenticated walk → screenshots → CP18 closure
(webhook delivery) → PWA install. v2 of the runbook (sealed
2026-05-14) reflects the executed order, not the original textbook
order; subsequent operator windows should follow v2 verbatim.

## Tests

The fast test suite (~30 tests at last count) runs per-file:

```bash
# Health route + auth derivation + portal bridge (lib/portal/*):
bun test ./apps/fast/app/api/health/route.test.ts \
         ./apps/fast/lib/auth/load-fast-auth-user.test.ts \
         ./apps/fast/lib/portal/*.test.ts \
         ./apps/fast/app/api/webhooks/portal/route.test.ts
```

Tests are excluded from `tsc --noEmit` (the `tsconfig.json` `exclude`
list keeps `@types/bun` out of Next.js' tsserver pass); they typecheck
implicitly when bun runs them.

## Pointers

- [`docs/integration-contract.md`](../../docs/integration-contract.md)
  — the binding rulebook
- [`docs/spec/05-fast-onboarding.md`](../../docs/spec/05-fast-onboarding.md)
  — the brownfield-onboarding spec fast executed against
- [`docs/adr/0011-fast-keeps-prisma.md`](../../docs/adr/0011-fast-keeps-prisma.md)
  — why fast keeps Prisma instead of migrating to Drizzle
- [`docs/adr/0003-single-origin-pwa.md`](../../docs/adr/0003-single-origin-pwa.md)
  — why `/fast/*` and not `fast.coms.com`
- [`apps/heroes-web/README.md`](../heroes-web/README.md)
  — the Svelte-side reference; auth-flow narrative + ADR-0005-vs-reality
  note carry across both apps
- [`apps/fast/docs/runbook-cp14-cp20-window.md`](docs/runbook-cp14-cp20-window.md)
  — operator runbook for the brownfield onboarding sweep
- [`tasks/plan.md`](../../tasks/plan.md) and
  [`tasks/todo.md`](../../tasks/todo.md) — the in-flight execution
  record

## When the next React app onboards

Use this app as the React-side template. Specifically:

1. Next.js (App Router) with `basePath: '/<app>'`.
2. Single auth derivation: mirror `loadFastAuthUser` — read
   `__session` from `cookies()`, call portal-api's `/api/userinfo`,
   upsert your `<app>` user table keyed on `portal_sub`, return
   the result.
3. Chrome from `@coms-portal/ui-react` (`ServiceBar` + `Sidebar` +
   primitives) + `@coms-portal/account-widget-react`.
4. Register your app via
   `apps/portal-api/scripts/register-<app>.ts` at deploy time
   (mirror `spec07-register-fast.ts`'s drift-detect-and-upsert shape
   — see FU-22 in `tasks/todo.md`) — that publishes your
   `app_registry` row, healthcheck URL, and webhook endpoint so
   portal can route events to you and ServiceBar surfaces you to
   every other app's chrome automatically.
5. Author your webhook consumer at
   `app/api/webhooks/portal/route.ts` mirroring this app's
   `lib/portal/` shape — OIDC verifier + envelope-unwrap + `event_id`
   PK dedup + per-event handlers + a dispatch map registering only
   the events your app subscribed to.
6. Set `SELF_PUBLIC_URL` to the bare Firebase Hosting origin (no
   basePath suffix); the audience portal mints is
   `new URL(endpoint.url).origin`. FU-24 records the trap.
7. Read `data.appCatalog` for cross-app links — never hardcode app
   slugs.

If you find yourself diverging from any of the above, write an ADR
documenting the deviation before merging. Silent drift is a bug.
