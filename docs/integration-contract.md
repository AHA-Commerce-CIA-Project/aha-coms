# Integration Contract

> Status: v1 draft (awaiting acceptance)
> Audience: every engineer building a COMS app
> Read this first. If you are an AI agent working on a COMS app, this document is your standing instructions.

The rules every app must satisfy to live in the COMS suite. Apps that violate the contract do not feel like part of the same product, and the suite-wide guarantees — single sign-on, unified chrome, consistent design, atomic platform changes, single installable PWA — break down.

**Deviations require an [ADR](./adr/) explaining the exception.** Silent drift is a bug. If you find yourself wanting to deviate, write the ADR first, get it accepted, then deviate.

For the *why* behind each rule, see the linked ADRs. This document describes the contract; the ADRs describe the reasoning that produced it.

---

## §1. Authentication and session

**Rule.** Every COMS app authenticates users by verifying portal-minted JWTs via `@coms-portal/sdk`. The app does not own credentials, does not host a login form, and does not maintain its own session state independent of the portal.

**Why.** [ADR 0006](./adr/0006-gip-only-auth.md), [ADR 0005](./adr/0005-jwt-stateless-sessions.md). One source of truth for who a user is. Atomic auth-contract changes. No duplicated user records to drift. Same-origin cookies eliminate cross-domain handoff.

**Satisfaction criteria.**

- App middleware verifies the portal JWT on every authenticated request using `@coms-portal/sdk`. No app-local signature verification.
- The session cookie is named `coms_session` and is set by the portal at the shared origin (`coms.com`). The app reads it; it does not set it.
- The app does NOT have `users`, `accounts`, `sessions`, or `verification` tables holding credentials. Tables modelled after Better Auth, Lucia, Auth.js, Clerk, etc. are explicitly forbidden in app schemas.
- The app does NOT expose `/login`, `/register`, `/forgot-password`, `/verify-email`, or any other credential-management route. Unauthenticated requests redirect to the portal's login flow.
- The app exposes `/logout` which calls the portal's logout endpoint via SDK and clears any app-local non-session state. Logout is portal-propagated; logging out of one app logs the user out of all apps.
- Session expiry policy is portal's. Apps do not extend, refresh, or shorten session lifetime independently.
- App-side user enrichment (loading the app-specific profile from the app's DB) happens *after* JWT verification. It is never a substitute for verification.

**Anti-patterns to remove on sight.**

- A `password` column in any app table.
- A `/api/auth/sign-in` route that takes credentials.
- A local sessions table that holds tokens minted by the app.
- An app-side OAuth callback that mints credentials (the only OAuth callbacks live in the portal).
- Reading `coms_session` and trusting it without SDK verification.

**Escape hatch.** None. Auth is the most load-bearing contract in the suite.

**Portal-side sign-in methods (informational, since Spec 06 PR F — 2026-05-19).** The portal accepts three orthogonal sign-in methods for end users; apps see exactly the same session cookie + JWT regardless of which one was used.

1. **Google sign-in** (workspace OIDC, `authMethod = 'workspace_oidc'`) — for `@ahacommerce.net` workspace identities.
2. **One-time code via email** (`authMethod = 'personal_otp'`) — for personal email identities provisioned in the portal.
3. **Email + password** (`authMethod = 'password'`) — added by Spec 06 PR F. Covers admin-created credential bags (`password_only_auth = TRUE` identities) and any workspace/personal user who has set a password via the change-password flow.

For users whose `password_set_at` is `NULL` at the time `FORCE_PASSWORD_SETUP_ENABLED` was flipped on (2026-05-20), the portal forces a one-time `/onboarding/set-password` step before any other route loads. After convergence, every user has a password and the sign-in surface stabilises at three coexisting methods. Password-bearing users can rotate their password from the `/portal/profile` Change-password section (PR #72). Operationally, the flag must be set on **both** Cloud Run services (it lives in `local.portal_shared_env` in `infra/cloud-run.tf` since PR #71 — the SSR gate that decides the redirect runs in-process inside portal-web's container), and the runtime SA `coms-portal-run-sa` must carry `roles/firebaseauth.admin` (PR #73 — without it, the Identity Toolkit admin calls return `INSUFFICIENT_PERMISSION` and the route fails as "Internal error"; see Spec 06 PR F §Risks for the post-mortem detail).

Apps never see the password. The `authMethod` literal is the only signal exposed in `auth_sessions.auth_method`; no app-side branching should be required on it.

---

## §2. User identity

**Rule.** The portal owns the canonical user record. Apps maintain app-specific profile tables keyed on the portal's user UUID. App access (membership) is granted in the portal, not in the app.

**Why.** [ADR 0006](./adr/0006-gip-only-auth.md). One place to deactivate a user. No phantom users when portal records change. App-specific data lives where it belongs.

**Satisfaction criteria.**

- The app's user-profile table is named `<app>_profiles` (e.g., `heroes_profiles`, `fast_profiles`, `<future_app>_profiles`).
- Its primary key is `id: uuid` and is **set to the portal user UUID**, not generated locally.
- The profile table does NOT have `email`, `password`, `email_verified`, `provider_id`, or other identity-defining columns. Identity comes from the JWT; the profile holds app-specific attributes (role within the app, preferences, denormalized snapshots).
- Profiles are upserted on the user's first authenticated request to the service. The pattern: verify the session, check that the `apps` claim contains the service's product-app slug, then `INSERT ... ON CONFLICT DO UPDATE` on `<app>_profiles` keyed on the portal user UUID. Two canonical reference implementations live in the tree: **heroes** on the Svelte side (`packages/heroes-shared/src/auth/user.ts` → `loadHeroesAuthUser`, post-Spec-02 Phase 2) and **fast** on the React/Next.js side (`apps/fast/lib/auth/load-fast-auth-user.ts` → `loadFastAuthUser`, post-Spec-05 Phase 3). They share the same auth derivation shape adapted to each framework's idioms. New apps should pick the framework-matched parallel as their template.
- The app checks `portalUser.apps.includes('<app_slug>')` from the JWT payload before allowing access. If the user is not granted membership in the portal, the app returns 403 and does not create a profile row.
- Deactivation: when the portal deactivates a user, it pushes a webhook. The app marks the profile inactive but does NOT delete the row (audit retention). See §11 for the webhook contract.
- Snapshot fields (`branch_value_snapshot`, etc.) are permitted for HR-sourced fields that change over time and have historical relevance. Document the snapshot semantics in the schema comment.
- Cross-app reference: an app NEVER stores another app's profile data. If heroes needs to know fast's user role, it asks fast via SDK, not via direct DB read.

**Anti-patterns to remove on sight.**

- A `users` table separate from `<app>_profiles`.
- A locally-generated `id` for a row that represents a portal user.
- Email or name stored in the app's profile table as the authoritative copy (portal is authoritative; cache only with a clear TTL and refresh mechanism).
- An app reading another app's database.

**Escape hatch.** None.

---

## §3. Chrome and account widget

**Rule.** Every app mounts the platform chrome and account widget from the framework-appropriate library variant. No app-built header replacements. Chrome configuration derives from the SDK-provided app catalog, never hardcoded.

**Why.** [ADR 0002](./adr/0002-cross-framework-ui-fork.md). The chrome is the most visible "single super app" signal. Drift here is the loudest UX inconsistency. Centralization is what keeps Svelte + React parity tractable.

**Satisfaction criteria.**

- Svelte apps import chrome from `@coms-portal/ui-svelte/chrome` and the widget from `@coms-portal/account-widget-svelte`.
- React/Next.js apps import from `@coms-portal/ui-react/chrome` and `@coms-portal/account-widget-react`.
- Required mounted components: `ServiceBar`, `Sidebar`, `MobileTopBar`, `MobileBottomNav`, `AccountWidget`.
- `serviceBarServices` is derived from `APP_LAUNCHER` in `@coms-portal/sdk/constants/app-launcher`, intersected with `data.user.apps`. **It is never hardcoded.** A new app appearing in the suite must surface in every existing app's chrome without code changes.
- `appSwitcher` data passed to `AccountWidget` is built the same way: `data.user.apps × APP_LAUNCHER`.
- The app owns: branding (logo + name in the brand slot), nav items inside chrome's nav slots, content rendered in the content slot, app-specific search/command palette.
- The app does NOT: rebuild `ServiceBar`, override the account dropdown internals, ship its own header above or below the platform chrome, replace the mobile bottom nav with a custom one.
- Svelte and React variants render visually identically per Figma. Visual regression testing in CI enforces this; PR that diverges them gets blocked.

**Anti-patterns to remove on sight.**

- A hardcoded `[{ slug: 'portal' }, { slug: 'heroes' }]` array in any app's layout.
- An app-built `Header.svelte` or `Header.tsx` rendered alongside (or instead of) `ServiceBar`.
- App-local logic translating `uiState.theme` to chrome's narrower type — this glue belongs in the chrome lib.
- App-local code building the `appSwitcher` array — this is a chrome lib helper.

**Escape hatch.** Slot content is the extension surface. If you need behavior the chrome doesn't support, propose an extension to the chrome library (a new slot, a new prop) via PR, not a local replacement.

---

## §4. Design tokens

**Rule.** All visual values — color, type, spacing, radius, shadow, motion timing — come from `@coms-portal/design-tokens`. No hardcoded hex codes, no custom type scales, no app-local Tailwind overrides that shadow tokens.

**Why.** [ADR 0002](./adr/0002-cross-framework-ui-fork.md). Tokens are the substrate that lets primitives feel consistent across framework variants. Hardcoded values are how design drift starts.

**Satisfaction criteria.**

- App imports `@coms-portal/design-tokens/css` for CSS variables OR `@coms-portal/design-tokens/tailwind` for the Tailwind preset.
- Tailwind config extends nothing that shadows token values (no `theme.extend.colors.primary = '#abc123'`).
- A lint rule blocks raw hex codes (`/#[0-9a-fA-F]{3,8}\b/`) in app source files. Allow-list exceptions live in comments next to the value with a justification.
- Custom values needed for an app's case go into `@coms-portal/design-tokens` first via a PR to the package, then consumed. Never inlined in the app.
- Motion timing comes from token-defined durations and easing curves. App-defined `transition: all 0.234s cubic-bezier(...)` is forbidden.

**Anti-patterns to remove on sight.**

- `background-color: #6366f1` anywhere in app source.
- A local `tailwind.config.ts` defining a color palette.
- `fontSize: '13.5px'` or any one-off type value.

**Escape hatch.** Motion timings inside an app-built animation that doesn't have a token equivalent may use raw values, but the values must come from a comment-documented motion scale; if you find yourself defining a scale, propose the scale for tokens.

---

## §5. Routing and base path

**Rule.** All apps live behind Firebase Hosting at `coms.com/<app>/*`. Each app is base-path aware. There is no subdomain-per-app architecture.

**Why.** [ADR 0003](./adr/0003-single-origin-pwa.md), [ADR 0004](./adr/0004-firebase-hosting-routing.md). Single origin makes the cookie/session story trivial, enables the single super-PWA model, and makes cross-app navigation feel like one product.

**Satisfaction criteria.**

- Each app's framework is configured with its base path:
  - Next.js: `basePath: '/<app>'` in `next.config.ts`
  - SvelteKit: `kit.paths.base: '/<app>'` in `svelte.config.js`
  - Elysia: `new Elysia({ prefix: '/<app>/api' })` or equivalent router-level prefix
- All internal links use framework helpers that respect the base path. SvelteKit: `${base}/foo` from `$app/paths`. Next.js: `<Link>` (handles automatically). Never `<a href="/foo">` that bypasses base-path resolution.
- Asset URLs honor the base path. (Both frameworks do this automatically when `basePath` is set; never construct asset URLs by hand.)
- Firebase Hosting `firebase.json` includes a `rewrites` entry for `/<app>/**` mapped to the app's Cloud Run service.
- Cross-app navigation uses path-relative links: `<a href="/heroes/leaderboard">`. **Never** `<a href="https://heroes.coms.com/leaderboard">`. There is no `heroes.coms.com`; there is only `coms.com/heroes`.
- The portal's chrome `ServiceBar` uses path-relative links for cross-app navigation. The `services` array's entries use `href: '/<app>'` not `href: 'https://...'`.
- No app reads `window.location.host` or `window.location.origin` to make logic decisions. Origin is the same across the suite.

**Anti-patterns to remove on sight.**

- A `portalOrigin` or `heroesOrigin` variable in any app — these are vestiges of the cross-origin era.
- An OAuth-style `portal_code` exchange endpoint after the initial migration is complete. (Initial login redirect from portal → app is fine; the *exchange* dance is not.)
- Hardcoded absolute URLs to other apps.

**Escape hatch.** A short-term staging or dev environment may run on a separate subdomain during incremental migration. Production must satisfy the rule.

---

## §6. Real-time and chat

**Rule.** Server-to-client real-time streams use Server-Sent Events (SSE). Client-to-server messages use ordinary HTTP POST. **No WebSockets through public ingress.** Cross-instance fanout on Cloud Run uses Postgres `LISTEN/NOTIFY`.

**Why.** [ADR 0007](./adr/0007-sse-over-websockets.md), [ADR 0004](./adr/0004-firebase-hosting-routing.md). WebSocket upgrades do not survive Firebase Hosting rewrites. SSE is sufficient for chat and live-update use cases at our scale. LISTEN/NOTIFY is the lightest fanout pattern for Postgres-backed apps and matches our default ORM.

**Satisfaction criteria.**

- Streams use `Content-Type: text/event-stream` and serve well-formed SSE events.
- Client uses native `EventSource` (or framework-native equivalent), which handles auto-reconnection.
- Servers emit a heartbeat ping every ~30 seconds (well within Firebase Hosting's 60s timeout) so the connection isn't perceived as dead before timeout cuts it.
- Cross-instance fanout: a writer instance issues `NOTIFY <channel>` after a write. All Cloud Run instances `LISTEN <channel>` and broadcast received notifications to their connected SSE subscribers.
- LISTEN/NOTIFY payload stays under 8KB (Postgres limit). For larger payloads, the NOTIFY carries an ID and subscribers fetch the row.
- Authentication on SSE: the JWT cookie is sent automatically on the `EventSource` GET; the server verifies it via SDK like any other authed request.
- App does NOT expose a public `wss://` endpoint. The Cloud Run service may run a WebSocket internally for service-to-service communication, but external clients reach it only via SSE through Firebase Hosting.

**Anti-patterns to remove on sight.**

- A `socket.io` server exposed on the app's public Cloud Run URL.
- An in-memory subscriber list with no LISTEN/NOTIFY backing — this silently breaks when Cloud Run scales to >1 instance.

**Escape hatch.** An app may use a direct Cloud Run URL for a WebSocket if SSE genuinely cannot satisfy the use case (e.g., binary protocols, very high message rates). This requires an ADR and breaks the single-origin PWA guarantee for that endpoint — the SW must explicitly handle the bypass.

---

## §7. ORM and data layer

**Rule.** Drizzle ORM is the default for all COMS apps. Cloud SQL Postgres is the database. Each app owns its own schema or database. There are no cross-app foreign keys.

**Why.** [ADR 0008](./adr/0008-drizzle-as-default-orm.md). One ORM minimizes cognitive load for engineers moving between apps. Schema isolation limits the blast radius of migrations. No cross-app FKs means apps can deploy and migrate independently.

**Satisfaction criteria.**

- App's data layer uses `drizzle-orm` + `drizzle-kit`.
- App's tables live in its own Cloud SQL Postgres database (or, if cost-sharing a single instance, its own schema with isolated migrations).
- Migrations live at `apps/<service>/src/db/migrations/` (or the service's framework-conventional location — e.g., `apps/<service>/prisma/migrations/` for Prisma). Heroes' current `packages/shared/src/db/migrations/` is a pre-consolidation artifact and moves into the api service during Spec 02.
- The portal's `identity-users.id` is referenced from app tables as a plain `uuid` column, NOT as a foreign key constraint. The constraint relationship is enforced at the application layer (membership check in §2), not at the database layer.
- Cross-app data access goes through portal SDK methods that wrap portal API calls. Apps NEVER connect to each other's databases.
- Connection pooling: Drizzle apps use `postgres` (Postgres.js) sized against the shared Cloud SQL instance's app-bucket, not against single-app intuition. The current shape across portal-api, heroes-api, and `packages/heroes-shared` is `max: 3, connect_timeout: 5, prepare: false` (no `idle_timeout`, no `max_lifetime` — Cloud SQL idles connections on its own; eager local timeouts only create reconnect storms). The 3-per-Cloud-Run-instance ceiling reflects `coms-aha-heroes-db`'s `db-f1-micro` default of `max_connections = 25` minus 3 superuser-reserved = 22 connections shared across portal-api + heroes-api + Cloud Run autoscaling headroom. `prepare: false` defends against pooled-connection statement-cache drift; `connect_timeout: 5` fails fast on a stalled `/cloudsql` socket rather than letting a single request hang the worker. Fast keeps Prisma (ADR 0011) and follows Prisma's own pool defaults against its dedicated `aha-fast-db-instance-cd5db712`.

**Anti-patterns to remove on sight.**

- A `references()` clause in a Drizzle schema pointing at a table in another app.
- An app's repository file importing another app's schema or db client.
- A new app adopting Prisma without an ADR.

**Escape hatch.** `aha-fast` currently uses Prisma. This is a documented exception, to be resolved by a future spec. New apps do not get this exception.

---

## §8. Deploys

**Rule.** Each *service* (each directory under `apps/`) has its own Cloud Run service, its own `cloudbuild.yaml`, and its own `infra/` with isolated OpenTofu state. A product app with split frontend+backend has two services and two of each artifact. Cloud Build triggers are path-filtered. Secrets come from Secret Manager.

**Why.** [ADR 0001](./adr/0001-monorepo-over-polyrepo.md), [ADR 0004](./adr/0004-firebase-hosting-routing.md). Monorepo without per-app deploy isolation just creates a coupled mega-service. The monorepo is the development unit; apps remain the deploy unit.

**Satisfaction criteria.**

- Service has `apps/<service>/cloudbuild.yaml` at the service root.
- Cloud Build trigger filters on `includedFiles: ['apps/<service>/**', 'packages/**']`. Changes to other services do not trigger this service's build.
- Service has `apps/<service>/infra/` with its own OpenTofu state. Shared infrastructure (VPC, Artifact Registry, top-level project settings) lives in `infra/shared/` at the monorepo root with its own state.
- Container images: `gcr.io/<gcp-project>/<service>:<git-sha>`. Latest tags are also pushed for convenience but deploys reference the SHA.
- Secrets are pulled from Secret Manager via `availableSecrets` in `cloudbuild.yaml`. **Never** passed as Cloud Build substitutions on the command line (which logs them).
- Build process: `bun install --frozen-lockfile` at the monorepo root (so workspace packages resolve), then `cd apps/<service>` for the service-specific build step.
- Cloud Run deploys are routed through Firebase Hosting (§5). The service's Cloud Run URL is internal; users never hit it directly in production.
- Each service provides a `/healthz` endpoint Cloud Run can probe.

**Anti-patterns to remove on sight.**

- Secrets in `cloudbuild.yaml` substitution defaults or `--substitutions=` flags.
- A `cloudbuild.yaml` that builds the entire monorepo for one app's deploy.
- A Cloud Build trigger that fires on every push to main regardless of changed files.

**Escape hatch.** None for the structure. The mechanism (Cloud Build vs alternative CI) is open if a future ADR justifies it; the per-app isolation rule is not.

---

## §9. PWA and service worker

**Rule.** The COMS suite is a single super-PWA at the origin root. There is one manifest, one service worker, one installable surface. The service worker is owned by `apps/portal-web`. Push notifications go through FCM.

**Why.** [ADR 0003](./adr/0003-single-origin-pwa.md). "Single super app" requires single origin and single SW. Push routing across apps requires a coordinated SW. FCM is the right answer in a GIP-anchored stack.

**Satisfaction criteria.**

- `apps/portal-web` serves `/sw.js` and `/manifest.webmanifest` at the origin root via Firebase Hosting passthrough.
- Service worker scope is `/` (covers the whole suite).
- Manifest defines the suite as one PWA: name `COMS`, single icon set, `display: standalone`, `start_url: '/'`. The `shortcuts` field deep-links into each app for the home-screen long-press menu.
- Other apps DO NOT register their own service workers, ship their own manifests, or call `navigator.serviceWorker.register` from their own code.
- The SW imports the app catalog (`APP_LAUNCHER` from `@coms-portal/sdk`) to know route → app mapping for push notification routing and asset precaching. The same import is used by chrome (§3) and access checks — one source of truth.
- The SW respects authentication state: routes requiring fresh auth are bypassed (network-first, no-cache) or have very short TTL. The cache never serves authenticated content to an unauthenticated browser.
- The SW is served with `Cache-Control: no-cache` so a deploy's new SW is picked up promptly.
- The SW includes a self-unregister kill switch: if a future SW deploy needs to forcibly clear out a broken predecessor, a flag in the SW can cause `self.registration.unregister()` followed by `clients.claim()` and reload.
- Push: each device registers one push subscription via the portal's subscription endpoint. Apps emit notification events via SDK; portal stores; FCM delivers; SW receives, decodes the target app slug, deep-links into `/<app>/...` on tap.

**Anti-patterns to remove on sight.**

- `vite-plugin-pwa` or `next-pwa` configured in any app other than `apps/portal-web`.
- An app calling `navigator.serviceWorker.register('/sw.js')` — this is portal-web's job.
- App-local `manifest.webmanifest` files.
- Push subscriptions stored in an app's database.

**Escape hatch.** None in production. Development convenience overrides (e.g., disabling the SW locally for a hot-reload session) are fine.

---

## §10. Notifications

**Rule.** Notifications are platform-owned. Services emit events via `@coms-portal/sdk`; the portal stores, displays, and routes them. The unified inbox lives in the account widget.

**Transitional note.** Both heroes and fast currently carry app-local notifications implementations that predate this contract — heroes since its standalone-era origin, fast since its brownfield onboarding under Spec 05. Migration to platform-owned is a dedicated future spec covering both apps in one sweep. **New apps must adopt platform-owned from day one — do not copy either app's notifications code as a pattern.** The presence of two reference implementations carrying the same deviation is *not* permission to add a third; it's evidence the deviation is brownfield-era technical debt the platform-notifications spec will retire.

**Why.** [ADR 0003](./adr/0003-single-origin-pwa.md). "Single super app" without a unified inbox is incomplete. Per-app notification stores produce N inboxes and missed cross-app messages.

**Satisfaction criteria.**

- Apps emit notifications via `@coms-portal/sdk` notification methods (`sdk.notifications.create(event)`).
- Notification records live in the portal's database, never in app databases.
- The account widget reads the unread count from a single platform endpoint (`GET /api/notifications/unread-count`).
- Deep links in notifications use the path-based router: `/heroes/notifications/123`. Tapping a notification from any surface (widget dropdown, SW push receipt, mobile push) navigates via the path.
- FCM payload encodes the target app slug so the SW can route correctly on tap (`{ "data": { "app": "heroes", "path": "/notifications/123" } }`).
- App-side: when an app needs to react to its own emitted notification (e.g., decrement a local counter), it subscribes to the portal's webhook events stream — see §11.

**Anti-patterns to remove on sight.**

- A `notifications` table in any app's database (other than portal's).
- An app rendering its own unread-count badge in chrome.
- An app's own push subscription storage.

**Escape hatch.** Transient app-local UI state (a toast that disappears in 4 seconds) is not a "notification" in this contract's sense — it's a UI element. The contract applies to persistent, addressable notifications.

---

## §11. Portal webhooks

**Rule.** The portal pushes lifecycle events to apps via webhooks (user provisioned / updated / offboarded, employment shape changes, taxonomy upserts and deletes, alias resolution changes, per-recipient app-config changes). Apps consume webhooks idempotently and recover from missed deliveries.

**Why.** Apps need to react to portal-side identity changes promptly. Webhooks are the agreed delivery mechanism; the alternative (apps polling the portal) doesn't scale and creates traffic spikes.

**Reference implementations.**

- **Heroes** (Elysia + Drizzle) — `apps/heroes-api/src/routes/portal-webhooks.ts` + `apps/heroes-api/src/services/portal-events/`. Authored 2026-05-08; per-event handlers in `services/portal-events/handle-*.ts`; dispatch map in `dispatch.ts`.
- **Fast** (Next.js Route Handler + Prisma) — `apps/fast/app/api/webhooks/portal/route.ts` + `apps/fast/lib/portal/`. Authored 2026-05-14 (T77 + T78); per-event handlers in `lib/portal/handlers/handle-*.ts`; dispatch map in `lib/portal/dispatch.ts`. The two implementations share the same auth + dedup + envelope-unwrap shape, adapted to each framework's idioms.

**Satisfaction criteria.**

- App exposes `POST <app-base-path>/api/webhooks/portal` and registers the URL with the portal during onboarding (`apps/portal-api/scripts/spec07-register-*.ts`). Heroes registers at `/heroes/api/webhooks/portal`; fast registers at `/fast/api/webhooks/portal`; both share the single Firebase Hosting origin `https://aha-coms.web.app`.
- Inbound requests carry three headers: `X-Portal-Event` (one of `PORTAL_WEBHOOK_EVENTS` from `@coms-portal/shared`), `X-Portal-Event-Id` (uuid, used for dedup), and `Authorization: Bearer <google-id-token>` signed by the portal's runtime service account. Reject missing headers with 400; reject invalid tokens with 401.
- Verify the ID token via `google-auth-library`'s `OAuth2Client.verifyIdToken({idToken, audience: SELF_PUBLIC_URL})` against `PORTAL_SERVICE_ACCOUNT_EMAIL` and `SELF_PUBLIC_URL`. The audience portal mints is `new URL(endpoint.url).origin` — for single-origin apps that is the bare Firebase Hosting origin, NOT the basePath-prefixed serving URL (FU-24's lesson; see `apps/fast/lib/portal/oidc.ts` and `apps/heroes-api/src/lib/oidc.ts` for the canonical verifier). The SDK also ships an HMAC-signing helper (`verifyWebhookSignature` in `packages/sdk/src/webhook.ts`) which portal falls back to when OIDC minting fails on its side, but ID-token verification is the primary path both reference implementations use.
- The app persists incoming events in `portal_webhook_events` with `event_id` as the primary key for idempotency. Heroes uses Drizzle (`packages/heroes-shared/src/db/schema/portal-webhooks.ts`); fast uses Prisma (`apps/fast/prisma/schema.prisma` → `PortalWebhookEvent` model). Dedup INSERT short-circuits the route to 200 before any handler runs, so portal's at-least-once retries replay safely.
- Unwrap the inbound `PortalWebhookEnvelope<T>` envelope into the inner `envelope.payload` before dispatching to per-event handlers. Passing the whole envelope to handlers silently no-ops them on `payload.<field>` reads (regression caught at heroes on 2026-05-05; pinned by `unwrapWebhookEnvelope` helpers + tests in both implementations).
- Handle the events the app subscribed to in `app_webhook_endpoints.subscribed_events` (a JSON array set during registration). The full event list lives in `PORTAL_WEBHOOK_EVENTS` at `packages/shared/src/contracts/webhook-events.ts`: `user.provisioned`, `user.updated`, `user.offboarded`, `employment.updated`, `app_config.updated`, `alias.resolved`, `alias.updated`, `alias.deleted`, `taxonomy.upserted`, `taxonomy.deleted`, `session.revoked`, `app.smoketest`. Unknown event types are logged and ignored (handlers map returns no entry → silent no-op), never 400-rejected — forward compatibility.
- `app.smoketest` events are dispatched synchronously by portal's `POST /api/v1/apps/:slug/smoketest` (Spec 06 Rev 4 PR B). Receivers ack 2xx without business processing; the route's dedup + unwrap path already produces this shape because no business handler is registered.

**Anti-patterns to remove on sight.**

- Trusting webhook contents without ID-token verification.
- Processing webhooks synchronously in a way that blocks the response beyond the dedup + dispatch fan-out — handlers should themselves be cheap (a Prisma upsert, a Drizzle update); long-running work fans out to a separate job runner if needed.
- Storing only the latest state without the event log (loses recoverability).
- Setting `SELF_PUBLIC_URL` to the Cloud Run URL of an app whose registered webhook is fronted by Firebase Hosting — the audience portal mints is the Hosting origin, not the Cloud Run URL. FU-24 records this trap.

**Escape hatch.** For low-volume read-side data that's already in the portal `__session`'s `/api/userinfo` response (email, role, apps), apps can skip webhook consumption for those fields and just re-read on next session. Webhooks are required only for events that need immediate side effects (offboarding propagation, access revocation, taxonomy updates that drive denormalized projections).

---

## §12. Internationalization

**Rule.** Apps that ship in multiple locales follow heroes' Paraglide pattern. The locale set is suite-coordinated.

**Why.** Cross-app navigation should not change the user's locale. Apps that don't internationalize must default to a shared locale set.

**Satisfaction criteria.**

- Locale preference is a portal-owned user attribute. The JWT carries the user's preferred locale; the app applies it.
- Apps internationalizing in 2026 use Paraglide for SvelteKit and `next-intl` for Next.js. (Same target message format if possible.)
- The locale set across apps is coordinated. A user with `locale: 'id-ID'` sees Indonesian everywhere or nowhere — not mixed.

**Escape hatch.** Single-locale apps may hardcode their copy, but the locale they hardcode must match the suite default.

---

## §13. Observability and logging

**Rule.** Structured logs via `pino`, written to Cloud Run's stdout. Errors include a correlation ID propagated from the portal where applicable.

**Why.** Cross-app debugging requires correlation. Cloud Logging gets us most of what we need without further investment.

**Satisfaction criteria.**

- App uses `pino` (server-side) with JSON output (default in production).
- Each authenticated request gets a correlation ID. If the request carries `x-correlation-id`, use it; otherwise generate a UUID and propagate it in downstream calls.
- The JWT's `sub` (portal user UUID) is logged on every authenticated request log line.
- App emits errors with `level: 'error'` and includes the correlation ID, user ID, and request path.
- App does NOT log secrets, full JWT payloads, or PII beyond what's necessary for debugging.

**Escape hatch.** Single-developer apps in early development may run with simpler logging temporarily, but production deploys must satisfy the rule.

---

## §14. Build and runtime tooling

**Rule.** The suite uses Bun for all package management and workspace operations. Each app's runtime is the one its framework officially supports — Bun for Elysia and SvelteKit apps, Node.js for Next.js apps. Infrastructure-as-code uses OpenTofu (`tofu` CLI), not Terraform.

**Why.** [ADR 0009](./adr/0009-bun-for-package-management.md), [ADR 0010](./adr/0010-opentofu-over-terraform.md). One install tool across the tree eliminates lockfile and resolution drift. Per-app runtime keeps each framework on the runtime it's built for. OpenTofu over Terraform avoids HashiCorp's BSL license terms while preserving full file compatibility with the existing HCL configurations.

**Satisfaction criteria.**

- Every app installs via `bun install --frozen-lockfile`. No app's Dockerfile or CI step uses `npm install` or `pnpm install`.
- The single suite-wide lockfile is `bun.lock` at the monorepo root. No app has its own `package-lock.json` or `pnpm-lock.yaml`.
- App `Dockerfile` base images reflect the app's runtime: `oven/bun:1` for Bun-runtime apps, `node:22-alpine` (or similar) for Node-runtime apps.
- New apps choose the runtime their framework officially supports. Experimental runtime combinations (e.g., Next.js on Bun in production) require an ADR.
- IaC for any app's infrastructure uses the `tofu` CLI. State backends and configuration follow the existing portal, heroes, and fast patterns (see [`infra/heroes/`](../infra/heroes/) and [`infra/fast/`](../infra/fast/) for the two worked examples — heroes for a Svelte + Drizzle service split into api + web, fast for a unified Next.js single-service shape).

**Anti-patterns to remove on sight.**

- A `package-lock.json` or `pnpm-lock.yaml` in any app or package directory.
- A Dockerfile installing dependencies via `npm install` instead of `bun install`.
- A `terraform` CLI invocation in any Cloud Build pipeline, Makefile, or script — use `tofu`.
- Running Next.js on Bun in production without an accompanying ADR.

**Escape hatch.** A single recalcitrant native dependency may be installed via `npm install <package>` as a documented fallback if it refuses to install under Bun. Note the workaround in a comment near the dependency.

---

## Onboarding a new product app — checklist

Work through this checklist **once per product app**. Each subsection is tagged with the service(s) it applies to:

- `[every service]` — every service in the product app
- `[backend]` — backend / api services only
- `[frontend]` — frontend / web services only
- `[product app]` — once per product app, not per service

A product app with split frontend+backend (e.g., heroes is `heroes-api` + `heroes-web`) runs `[backend]` items on the api service and `[frontend]` items on the web service. A product app on a unified runtime (e.g., fast on Next.js) runs both on the same service.

### Repository structure `[every service]`

- [ ] Service lives at `apps/<service>/`
- [ ] Service is a Bun workspace member; the monorepo root `package.json` includes `apps/<service>` in `workspaces`
- [ ] Service's `package.json` uses `workspace:*` for in-tree dependencies (`@coms-portal/sdk`, `@coms-portal/shared`; plus the framework-appropriate UI and widget variants + `@coms-portal/design-tokens` for frontend / unified-runtime services)
- [ ] Service has `apps/<service>/docs/` if it uses spec-driven development for internal work

### Auth — backend concerns (§1, §2) `[backend]`

- [ ] Service middleware verifies portal JWTs via `@coms-portal/sdk` on every authenticated request
- [ ] Service has no `users` / `accounts` / `sessions` / `verification` tables holding credentials
- [ ] Service has `<app>_profiles` table keyed on portal user UUID
- [ ] Service checks `portalUser.apps.includes('<app>')` before creating a profile row

### Auth — frontend concerns (§1, §2) `[frontend]`

- [ ] Service has no `/login`, `/register`, `/forgot-password`, or `/verify-email` routes
- [ ] Unauthenticated requests redirect to portal login
- [ ] Service's `/logout` invokes portal logout via SDK

### UI (§3, §4) `[frontend]`

- [ ] Service mounts `ServiceBar`, `Sidebar`, `MobileTopBar`, `MobileBottomNav`, `AccountWidget` from the framework-appropriate lib variant
- [ ] `serviceBarServices` and `appSwitcher` are derived from `APP_LAUNCHER × user.apps`; not hardcoded
- [ ] Service uses `@coms-portal/design-tokens/css` (or `/tailwind`); no hardcoded hex codes
- [ ] Lint rule blocking raw hex codes is configured

### Routing (§5) `[every service]`

- [ ] Framework configured for the service's base path (Next.js `basePath`, SvelteKit `kit.paths.base`, Elysia route prefix)
- [ ] All internal links use framework-native base-path-aware helpers
- [ ] Cross-app links are path-relative (`/heroes/foo`), never origin-absolute
- [ ] `firebase.json` rewrite added for the service's path → its Cloud Run service

### Data and real-time (§6, §7) `[backend]`

- [ ] Service uses Drizzle ORM + Cloud SQL Postgres (or has documented Prisma exception)
- [ ] Service's schema has no foreign keys pointing at other apps' tables
- [ ] Migrations live at the service's conventional location (e.g., `apps/<service>/src/db/migrations/`)
- [ ] If service has real-time features: SSE through Firebase Hosting, no public WebSockets
- [ ] If service has multi-instance real-time: LISTEN/NOTIFY for cross-instance fanout

### Platform integration (§10, §11) `[backend]`

- [ ] Service emits notifications via SDK; no service-local notifications table (heroes is a documented exception — do not copy)
- [ ] Service exposes `POST <app-base-path>/api/webhooks/portal` and verifies inbound Google ID tokens via `google-auth-library` against `PORTAL_SERVICE_ACCOUNT_EMAIL` + `SELF_PUBLIC_URL` (the audience equals `new URL(endpoint.url).origin`, not the basePath-prefixed serving URL — see §11 and FU-24)
- [ ] Service stores webhook events idempotently in `portal_webhook_events` with `event_id` as PK; the route's dedup INSERT short-circuits to 200 before any handler runs
- [ ] Service unwraps `PortalWebhookEnvelope<T>` to `envelope.payload` before dispatching to per-event handlers; never pass the full envelope through (heroes' 2026-05-05 regression anchors this rule)
- [ ] Service has a `scripts/reconcile-portal.ts` (or app-specific equivalent like fast's `scripts/sync-taxonomies.ts`) for missed-delivery recovery

### Deploys (§8) `[every service]`

- [ ] Service has `apps/<service>/cloudbuild.yaml`
- [ ] Cloud Build trigger filters on `apps/<service>/**` + `packages/**`
- [ ] Service has `apps/<service>/infra/` with isolated OpenTofu state
- [ ] Secrets from Secret Manager via `availableSecrets`, never substitutions
- [ ] Service has `/healthz` endpoint

### PWA and SW (§9) `[product app]`

- [ ] No service in this product app registers its own service worker
- [ ] No service in this product app ships its own `manifest.webmanifest`
- [ ] The product app's routes (`/<app>/**`) are correctly handled by portal-web's service worker (verify in DevTools)

### Observability (§13) `[every service]`

- [ ] Service uses `pino` with JSON output in production
- [ ] Service logs correlation IDs and portal user UUIDs on authenticated requests
- [ ] Service does not log JWT payloads, passwords, or PII

### Build and runtime tooling (§14) `[every service]`

- [ ] Service installs via `bun install --frozen-lockfile`; no other lockfile present
- [ ] Dockerfile base image matches the service's runtime (`oven/bun:1` for Bun runtime, `node:22-alpine` for Node runtime)
- [ ] Service's `infra/` uses `tofu` (OpenTofu); no `terraform` CLI invocations in scripts or pipelines
- [ ] No `package-lock.json` or `pnpm-lock.yaml` committed in the service directory

### Sanity test — end-to-end `[product app]`

- [ ] User authenticates against the product app via portal SSO; no separate login form appears
- [ ] User logged into one product app sees themselves logged into this product app without re-login
- [ ] Account widget renders; logout from this product app logs out of all apps
- [ ] App switcher in chrome shows other apps the user has access to
- [ ] Mobile chrome renders identically to existing apps (visual parity check)
- [ ] PWA install prompt offers the COMS suite (not just this product app)
- [ ] A portal-emitted webhook (e.g., `user.offboarded`, `app_config.updated`, or `app.smoketest` from `coms-portal-cli smoketest <slug>`) is consumed correctly — verified by inspecting `portal_webhook_events` for the dedup row and the corresponding handler-side projection (e.g., `User.accountStatus = 'rejected'` for `user.offboarded`)

---

## Glossary

- **Portal** — the COMS platform. Owns identity, app catalog, notifications, the service worker, and the integration contract. Implemented as two services: `apps/portal-api` (Elysia + Bun) and `apps/portal-web` (SvelteKit). Together they constitute the portal product app.
- **Product app** — a user-facing product in the suite (portal, heroes, fast, and future apps 3 and 4). A product app may comprise one or more services. Served at `/<app>/*` (or `/` for portal).
- **Service** — a single deployable unit. Lives under `apps/<service>/` with its own `cloudbuild.yaml`, its own `infra/`, and its own Cloud Run service. A product app with split frontend+backend has two services (e.g., heroes is `heroes-api` + `heroes-web`); a product app on a unified runtime has one (e.g., fast is just `fast`).
- **Library / package** — a shared package in `packages/` consumed by services via `workspace:*`. Examples: `@coms-portal/sdk`, `@coms-portal/shared`, `@coms-portal/design-tokens`.
- **Chrome** — the platform-provided UI shell: `ServiceBar`, `Sidebar`, `MobileTopBar`, `MobileBottomNav`, `AccountWidget`.
- **App catalog** — the list of all product apps in the suite, defined as the `APP_LAUNCHER` constant in `@coms-portal/sdk` (path: `@coms-portal/sdk/constants/app-launcher`). Consumed by chrome, push notification routing, and access checks. Single source of truth.
- **Single super-PWA** — the architectural target: one installable PWA at `coms.com`, one service worker, one manifest. Multiple product apps inside.
- **Integration contract** — this document.
- **Reference implementation** — two parallel apps prove the contract is framework-orthogonal: **heroes** (post-Spec-02, SvelteKit + Drizzle, the Svelte-side reference) and **fast** (post-Spec-05, Next.js + Prisma, the React-side reference). Both apps carry the same deviation (notifications remain app-local until the platform-notifications spec ships); both apps demonstrate the auth derivation, chrome integration, webhook consumption, app registry, and PWA installability shapes. Reading material:
  - Svelte side: [`apps/heroes-web/README.md`](../apps/heroes-web/README.md) + [`apps/heroes-api/README.md`](../apps/heroes-api/README.md)
  - React side: [`apps/fast/README.md`](../apps/fast/README.md)
  - The cross-framework UI fork ADR ([ADR 0002](./adr/0002-cross-framework-ui-fork.md)) is what makes the parity sustainable.
