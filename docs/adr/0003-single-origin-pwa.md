# ADR 0003: Single-origin super-PWA

Status: accepted (2026-05-11)

## Context

The COMS suite is mandated to deliver a unified "single super app" experience for users, including PWA installation on mobile. The current state is subdomain-per-app: heroes lives at one origin, portal at another. Cross-app navigation is a full page load. Cookie-based session state cannot cross origins, requiring a `portal_code` one-time-code exchange flow whenever a user moves between apps.

PWA mechanics constrain the choice:

- A web app manifest is per-origin. Subdomain-per-app means N installable PWAs, not one.
- A service worker is scoped per-origin (and per-path within an origin). Multiple SWs across subdomains cannot coordinate shared cache strategy or push routing.
- Users install per-origin — they'd see separate install prompts for `heroes.coms.com` and `fast.coms.com` and end up with 3 home-screen icons.

The "iOS app suite" model (separate installables, family-related styling, shared login) does not satisfy the mandate. The mandate is "single super app containing several apps" — WeChat-shape, Slack-shape, Notion-shape.

## Decision

The COMS suite is served at a single origin: `coms.com`. All apps live under URL paths:

- `coms.com/heroes/*` → heroes Cloud Run
- `coms.com/fast/*` → fast Cloud Run
- `coms.com/*` → portal-web Cloud Run (portal's own pages)
- `coms.com/api/*` (or `coms.com/portal-api/*`) → portal-api Cloud Run

Routing is via Firebase Hosting URL rewrites (ADR 0004). Each app's framework is base-path aware: Next.js `basePath`, SvelteKit `kit.paths.base`, Elysia router prefix.

One service worker, served from `/sw.js` at the origin root, scoped to `/`, owned by `apps/portal-web`. One `manifest.webmanifest`, served from `/manifest.webmanifest`. One installable PWA called "COMS." The manifest's `shortcuts` field provides deep links into each app for the home-screen long-press menu.

Auth simplifies dramatically: same origin = same cookie. The `coms_session` cookie set by portal is automatically visible to every app. The `portal_code` exchange flow is removed (it exists today only because cookies can't cross origins).

## Consequences

**Positive.**

- "Single super app" semantics: one install, one icon, one PWA.
- Cookie-based session works without ceremony. The `coms_session` cookie crosses paths within the origin; no exchange needed.
- The service worker can coordinate cache strategy, push routing, and offline behavior across all apps.
- Cross-app navigation is a route change, not a page load. Feels like one product.
- Auth state is consistent: if the user is logged into portal, they're logged into every app.

**Negative.**

- Every app's framework must be base-path aware. Configuration cost is low (one line each), but every internal link, asset path, and form action must honor the base path. Frameworks handle this automatically once configured; ad-hoc absolute paths in app code break.
- Service worker engineering is finicky and load-bearing. SW bugs in production are nasty — clients cache the broken SW. Mitigations: careful first implementation, self-unregister kill switch, `Cache-Control: no-cache` on `/sw.js`.
- Local dev complexity. Each engineer running `bun run dev` per-app hits direct app URLs, not the proxied paths. A dev-time proxy mirror (Caddy, local Firebase Hosting emulator) is necessary to validate base-path correctness and PWA behavior pre-deploy.
- Heroes migration cost: drop cross-origin patterns, drop `portal_code` exchange flow's steady-state usage, rewrite cross-app links to path-relative form, drop `portalOrigin` / `heroesOrigin` variables.

**Neutral.**

- Per-app Cloud Run services unchanged. Per-app deploys unchanged. Only the fronting layer changes.
- The `portal_code` flow may persist for the *initial* login redirect (portal → app on first SSO arrival), but the steady-state cookie handling is direct.

## Alternatives considered

**Subdomain per app, multiple PWAs, shared login.** Simpler infrastructure, lower engineering cost. But it fails the unification mandate. Users end up with multiple installables, multiple SW deployments, no unified push, full-page cross-app navigation. "iOS suite," not "super app."

**Single-page-app shell with micro-frontend module federation.** All apps loaded as runtime modules inside a single SPA at `coms.com`. Truest "one app" feel. Rejected because:

- Framework heterogeneity (Svelte + Next.js) makes federation borderline infeasible.
- Webpack Module Federation / Single SPA tooling complexity is wildly mismatched to a 4-engineer team.
- Each app team must play by federation rules — a real constraint on independent development.

**iframe-embedded apps inside a portal shell.** One installable PWA at portal origin, apps loaded into iframes. Rejected because:

- Iframes can't be PWA-installed; only the outer page is.
- Auth handoff across iframe origin is awkward (postMessage gymnastics).
- Mobile keyboard handling and deep linking are painful inside iframes.
- Performance penalty per navigation.

## References

- Integration contract §§ 5, 9.
- ADR 0004 (Firebase Hosting routing) — the mechanism that implements this decision.
- ADR 0005 (JWT stateless sessions) — same-origin cookies are what make stateless sessions clean.
