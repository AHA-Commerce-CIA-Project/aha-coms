# Rev 3 — Spec 01: Shared Account Widget

> Priority: **1 (only Rev 3 spec; foundation for any future suite-UX work)**
> Scope: Portal (widget package, userinfo endpoint, RP-initiated logout) + Heroes (widget adoption, header refactor)
> Prerequisites: Rev 2 Spec 01–04 (RS256/JWKS, OIDC discovery, webhook + introspect via Google OIDC). Identity is portal-owned; this spec surfaces it.
>
> **Spec 06 status (2026-05-03):** Spec 06 (`spec-06-dual-email-auth.md`) shipped end-to-end (PRs A → F) on 2026-05-03 — PR E commit `212e103`, CI run `25265594527`; PR F commit `8f13c64`. The schema restructure is in: `identity_users.email` and `identity_users.personal_email` were dropped and replaced by the multi-row `identity_user_emails` table; an OTP-based auth path for personal-email + admin sign-out-everywhere + active-sessions panel + super-admin one-time login link are live. **Widget-side impact remains zero** — `/api/userinfo` still exposes a scalar `email` (derived as "workspace if present, else personal-primary, else first-personal" per Spec 06 §Q8a) alongside the additive `emails` array. `@coms-portal/shared` is at v1.5.0 with `emails: UserEmailEntry[]` on `UserProvisionedPayload`. Heroes-side adoption per `heroes-integration-handoff.md` is now unblocked. See `spec-00-implementation-timeline.md` for the at-a-glance status.

---

## Status — 2026-04-28

**Portal-side: shipped.** `@coms-portal/account-widget` v0.1.0 published at https://github.com/mrdoorba/coms-account-widget. Portal `apps/web` mounts the widget in the chrome's right slot. Portal `apps/api` serves `GET /api/userinfo` and OIDC RP-initiated logout via `GET /api/auth/logout` (origin allowlist against `app_registry.url` excluding deprecated rows; per-path post-logout URIs supported per §Sign-out).

**Heroes-side: SHIPPED 2026-05-03** (PR #2 on `mrdoorba/coms-aha-heroes`, deploy run `25267737871`). Heroes' chrome migrated to `@coms-portal/ui/chrome` (ServiceBar / Sidebar / MobileTopBar / MobileBottomNav); the four lifted Heroes-local files deleted. AccountWidget mounted in both ServiceBar and MobileTopBar right slots. Drizzle migration `0010_dear_kabuki` applied to staging + prod, adding `session.portal_role` + `session.apps` columns populated by the broker exchange — surfaces what the widget needs onto `locals.user` without a per-request portal RTT. New `/logged-out` route handles the post-portal-logout landing (clears the heroes session cookie, renders splash). `PUBLIC_APP_ORIGIN` wired through `deploy.yml` for both environments. Widget API is still **v0.2.0** (the v0.1.0 → v0.2.0 bump shipped `styles.css` for Tailwind v4 source registration); promotion to v1.0.0 follows after 7+ days of production soak per spec-02 §Versioning. The first prop-API tweak the integration surfaced was the chrome's `right` snippet pattern working as designed; no breaking changes back to portal needed.

---

## Overview

Today the portal owns identity (correctly, post-Rev 2), but the user-facing surface for that identity exists only on the portal. A user inside Heroes:

1. Has no avatar / account menu in the top-right.
2. Has no link to their profile (the portal's `/profile` page is not reachable from Heroes).
3. Has no consistent sign-out — Heroes' own logout does not end the portal session, and the portal's logout does not cascade to Heroes.
4. Has no indication of which app in the suite they are currently in (no "you are here" highlight, no app switcher).

Rolling our own per-app menu in each H-app would diverge fast and re-introduce the symmetric-secret-style fragmentation that Rev 2 just closed — except now in the UX layer instead of the auth layer. Every major IdP-fronted suite (Google's OneGoogle/gbar, Microsoft's M365 suite header, AWS's Identity Center menu) converged on the same answer: a **single shared component** that every app embeds, with the host app passing in only the minimum context (which app it is, where the portal lives) via props.

This spec defines that component, its distribution, its data flow, and the rollout across portal + Heroes.

---

## Decisions Up Front

### Distribution: npm package, not CDN-hosted bundle

Publish as `@coms-portal/account-widget` alongside the existing `@coms-portal/shared` package. Reasons:

- The portal monorepo already publishes `@coms-portal/shared` (consumed by `apps/web` and Heroes). Adding a sibling package is zero new infrastructure.
- CDN-hosted bundles (Google's gbar model) are right at Google's scale where a hundred+ properties consume the same chrome and cache invalidation matters more than build coupling. At our scale (portal + a small N of H-apps), npm versioning is simpler and gives every app a deterministic build.
- SemVer on the package is the contract. Apps pin a minor; breaking changes go through a major bump and a documented migration.

### Component framework: Svelte 5

Portal is Svelte 5; Heroes is Svelte 5. The widget ships as a Svelte component (not a framework-agnostic web component) because:

- Both consumers are Svelte; web-component overhead buys us nothing.
- Svelte 5's runes + `$props` give us a clean prop surface without the boilerplate of custom-element attribute parsing.
- If a non-Svelte H-app appears later, we re-evaluate then. Don't pre-pay for hypothetical consumers.

### Widget is presentational; host owns data

The widget does **not** call portal endpoints itself. The host app passes in the session (already loaded server-side for both portal and Heroes) as a prop. Reasons:

- Cross-origin fetch from Heroes to portal needs CORS + cookie work. The host already loads the session for its own auth gate; passing it down avoids a second round-trip.
- Keeps the widget pure-render. Easier to test, easier to storybook, no environment coupling.
- The single non-presentational action — sign-out — is a redirect to the portal's logout URL, which is just a `window.location.assign` and does not need fetch.

### App-switcher data source

`/api/userinfo` is the source of truth for which apps the user can launch and how to render them. The endpoint already returns `apps: [{slug, label, url}]` from `app_registry` (see `apps/api/src/routes/userinfo.ts:33–89`); the OIDC ID token's `apps` claim is a coarse access list, but the userinfo response carries the launcher-ready label + URL fields. The widget renders `appSwitcher` as a prop: an array of `{ slug, label, url }` that the host derives from `/api/userinfo`.

This means:

- Portal passes `appSwitcher` from its own server-loaded userinfo response.
- Heroes calls `/api/userinfo` (or proxies it through its own SSR layer) to derive `appSwitcher`.
- No new endpoint needed — the existing `/api/userinfo` is already the rich payload. The transitional `APP_LAUNCHER` constant in `@coms-portal/shared` is being retired in Spec 03c (the chrome currently consumes the constant; the migration to the userinfo response is queued).

### Service-bar list vs. popover app list — both, by design

The same `user.apps` source feeds **two presentations** in the chrome:

1. **Service bar tabs** (always visible) — a short, curated horizontal list of apps. Optimized for one-click switching between daily-driver apps. Rendered by `<ServiceBar>` in `@coms-portal/ui` (Spec 02), which takes `services` as a prop.
2. **Account widget popover app list** (one click to open) — the same apps in a richer, vertical layout with extra metadata: "you are here" highlight, last-accessed timestamp, role within the app, notification badge. Rendered inside `<AccountWidget>` via the `appSwitcher` prop.

This redundancy is **intentional**, not duplication. Microsoft 365 has it (suite header + waffle launcher). Google has it (product nav + gbar popover). AWS has it (Services menu + Recently Visited). The two surfaces serve different latencies:

- **Service bar:** instant, cheap, short. Pixel real estate is precious; fits ~5–6 apps before overflow.
- **Popover:** slower (one click), richer, full list. Discovery and metadata fit here.

**Practical rule for the suite:**

- **N ≤ 6 apps:** service bar shows all of them inline. Popover shows the same apps with extra metadata.
- **N > 6 apps:** service bar shows the top 5 daily-drivers + a "More ▾" overflow. Popover shows the full list. Microsoft's threshold sits roughly here.

**Single source, two presentations:**

- `services` prop on `<ServiceBar>` carries the minimum fields needed for inline tabs: `{ slug, label, url }`.
- `appSwitcher` prop on `<AccountWidget>` carries the same plus richer fields: `{ slug, label, url, lastAccessedAt?, role?, notificationCount? }`.
- Both derive from the host's `/api/userinfo` response — the endpoint already returns `apps: [{slug, label, url}]`, which is the same shape the open question below originally proposed. The chrome's current consumption of the static `APP_LAUNCHER` constant is the gap Spec 03c closes.

A future maintainer should not "deduplicate" these two surfaces by removing one. They solve different problems.

### Highlight behavior: explicit prop, not URL sniffing

`currentApp: string` (slug matching entries in `user.apps`) is required. The widget bolds / accents the matching row in the app switcher and may render the app's label next to the portal logo on the left. The host sets it at compile time or from an env var. **Never sniff `window.location`** — H-apps may run on custom domains, behind reverse proxies, or in iframe embeds, and URL-based detection breaks silently in any of those cases.

### Sign-out: RP-initiated OIDC logout

Sign-out from the widget hits `${PORTAL_ORIGIN}/auth/logout?post_logout_redirect_uri=...`. The portal's logout endpoint:

1. Clears the portal session cookie.
2. Returns OIDC RP-initiated logout response per the OIDC spec, which the relying-party app handles to clear its own session.
3. Redirects to `post_logout_redirect_uri` (the portal landing page by default; H-apps may pass their own logged-out splash).

This is a behavior change on the portal's existing logout endpoint — today it clears the portal session only. The widget cannot ship without this change, so it is **part of this spec**, not a follow-up.

---

## Widget API

```ts
// @coms-portal/account-widget
export interface AccountWidgetProps {
  // Required: which app is hosting the widget. Must match a slug in user.apps.
  currentApp: string

  // Required: portal origin for "Manage account" link and sign-out redirect.
  portalOrigin: string

  // Required: the authenticated user. Host loads this server-side and passes down.
  user: {
    name: string
    email: string
    portalRole: string
    apps: string[]
  }

  // Required: list of apps to show in the launcher. Host derives from user.apps.
  appSwitcher: Array<{
    slug: string
    label: string
    url: string
  }>

  // Optional: override the default "logged out" landing.
  postLogoutRedirectUri?: string

  // Optional: render a notifications-bell slot (Rev 3 future spec).
  notificationsSlot?: Snippet
}
```

Usage in any host:

```svelte
<script lang="ts">
  import { AccountWidget } from '@coms-portal/account-widget'
  import { PUBLIC_PORTAL_ORIGIN } from '$env/static/public'

  let { user, appSwitcher } = $props()
</script>

<header class="...">
  <Logo />
  <Nav />
  <AccountWidget
    currentApp="heroes"
    portalOrigin={PUBLIC_PORTAL_ORIGIN}
    {user}
    {appSwitcher}
  />
</header>
```

Heroes passes `currentApp="heroes"`. Portal passes `currentApp="portal"`. Future H-apps pass their own slug. The widget code is identical across all.

---

## Visual Spec

The widget renders, right-to-left in the host header:

1. **Avatar button** — circle with initial of `user.name`, same treatment as portal's current `/profile` page header (`apps/web/src/routes/(authed)/profile/+page.svelte:18`).
2. **Popover (on click)**:
   - Header row: full name, email, role chip (using `PORTAL_ROLE_LABELS`).
   - Section: "Manage account" link → `${portalOrigin}/profile`.
   - Section: "Apps" — list of `appSwitcher` entries. The row whose slug matches `currentApp` gets accent treatment (left border + bg muted).
   - Section: "Sign out" button — triggers RP-initiated logout.
3. **Optional left-of-logo product label** — when `currentApp !== "portal"`, render the app's label (e.g. "Heroes") as a subtle prefix next to the portal mark. Mirrors Microsoft's M365 suite-header pattern.

> **As of Spec 06 PR A (shipped 2026-04-30, commit `049008d`):** `/api/userinfo` includes an additive `emails: UserEmailEntry[]` array alongside the existing scalar `email` field. The scalar `email` is derived per Spec 06 §Q8a (workspace email if present, else personal-primary, else first-personal). Widget v1 consumes only the scalar `email` field and is behaviorally unchanged; future widget versions may surface a "manage all emails" inline action using the `emails` array.

Design tokens come from `@coms-portal/shared` (already used by both portal and Heroes), so the widget inherits the existing palette without a separate theming layer.

---

## Portal-Side Changes

### New package

Create `packages/account-widget/` (or wherever monorepo convention places shared libs — match existing `@coms-portal/shared` placement):

- `package.json` — name `@coms-portal/account-widget`, peerDeps on `svelte`.
- `src/AccountWidget.svelte` — the component above.
- `src/index.ts` — re-export.
- Standard build/publish wiring matching `@coms-portal/shared`.

### Portal app adoption

In `apps/web/src/lib/components/layout/`:

- `Sidebar.svelte:27` and `Sidebar.svelte:143` — remove the standalone "Profile" nav entries (replaced by the widget popover). Profile is no longer a sidebar destination; it is reached via the widget's "Manage account" link.
- `MobileNav.svelte:13` — same removal.
- `ServiceBar.svelte:120` — replace the bare profile link with `<AccountWidget currentApp="portal" .../>`.
- The header now has a single account surface instead of three.

### Logout endpoint change

Update `apps/api/src/routes/auth/logout.ts` (or wherever the portal's logout handler lives — confirm during implementation):

- Accept `post_logout_redirect_uri` query param.
- Validate it against an allowlist of registered relying parties (the `apps` table from Rev 1 Spec 02 already has the registered origins).
- Clear the portal session cookie.
- Redirect to the validated URI.

**Allowlist enforcement is mandatory** — without it, `post_logout_redirect_uri` becomes an open-redirect vector. Same model the OIDC spec mandates and Auth0 / Entra enforce.

### Launcher endpoint (already shipped as `/api/userinfo`)

`GET /api/userinfo` already returns `apps: [{slug, label, url}]` from `app_registry` (`apps/api/src/routes/userinfo.ts:33–89`) — it is the OIDC userinfo response and doubles as the launcher source. The original "deferred until third H-app" framing assumed a separate `/api/me/apps` endpoint; that endpoint is unnecessary because `/api/userinfo` is already the rich payload.

The remaining work is a chrome-side migration: `apps/web/src/routes/(authed)/+layout.svelte:59–69` currently consumes the static `APP_LAUNCHER` constant from `@coms-portal/shared` and silently filters apps not in the constant. The migration to consume `/api/userinfo` is tracked in **Spec 03c**.

---

## Heroes-Side Changes (H1)

Heroes adopts the widget as the pilot H-app. Work to land on the Heroes side, coordinated via `heroes-team-handoff.md` (to be written as part of this spec's rollout):

1. `bun add @coms-portal/account-widget` (once portal publishes).
2. Heroes' top-bar component:
   - Remove its existing user menu (if any) or "Sign out" button.
   - Mount `<AccountWidget currentApp="heroes" portalOrigin={env.PORTAL_ORIGIN} user={...} appSwitcher={...} />`.
   - `user` is already loaded server-side from the OIDC session; pass it through.
   - `appSwitcher` is derived from the `apps` claim on the OIDC ID token + a slug→URL map shared via `@coms-portal/shared`.
3. Heroes' existing logout handler:
   - Replace with a redirect to the portal's logout URL (carrying `post_logout_redirect_uri`).
   - On handling the post-logout return, clear Heroes' own session cookie.

No Heroes-side auth code changes; the OIDC verifier from Rev 2 already exposes everything the widget needs.

---

## Data Flow Summary

```
User in Heroes clicks avatar
   │
   ▼
Widget renders popover with user + appSwitcher (already in props)
   │
   ▼ (user clicks "Manage account")            ▼ (user clicks "Sign out")
window.location = portalOrigin + /profile      window.location = portalOrigin + /auth/logout?post_logout_redirect_uri=heroesOrigin + /logged-out
   │                                            │
   ▼                                            ▼
Portal session cookie already valid;            Portal validates redirect URI (allowlisted),
profile page renders.                           clears portal session,
                                                returns OIDC RP-initiated logout response,
                                                redirects to heroesOrigin/logged-out.
                                                Heroes-side handler clears Heroes session.
```

No new portal endpoints in the critical path. The widget is, at runtime, two `window.location` redirects and a popover render.

---

## Migration / Rollout

Phase 1 — **Portal-side widget package + portal adoption**
- Publish `@coms-portal/account-widget@0.1.0`.
- Portal `apps/web` consumes it; existing sidebar profile entries removed.
- Logout endpoint gains `post_logout_redirect_uri` support with allowlist.
- Portal ships behind no flag — internal-only blast radius until Heroes adopts.

Phase 2 — **Heroes adoption (H1)**
- Heroes consumes the published package.
- Heroes' header refactor lands behind a per-deploy flag (`HEROES_USE_PORTAL_ACCOUNT_WIDGET`) for the first 7 days, then flag is removed.
- After flag removal, both portal and Heroes are on the same widget version.

Phase 3 — **Documented onboarding for future H-apps**
- `docs/architecture/rev3/h-app-onboarding.md` describes: install package, pass props, set `currentApp`, register origin in portal allowlist, done.

No big-bang migration. Phase 1 and Phase 2 each ship as standalone PRs; suite-wide consistency is achieved at end of Phase 2.

---

## Risk + Mitigations

| Risk | Mitigation |
|------|-----------|
| `post_logout_redirect_uri` becomes an open redirect. | Allowlist against registered apps table. Reject unregistered URIs with 400, log them. |
| Cross-origin cookie behavior breaks "Manage account" link from Heroes. | Portal session cookie is already same-site=lax + portal origin; clicking the link is a top-level navigation, which carries the cookie. Verified during Phase 1 staging. |
| Widget version drift (portal on v0.2, Heroes pinned to v0.1). | Renovate already runs for `@coms-portal/*` packages; major bumps require manual review and a coordinated portal+Heroes PR. |
| `currentApp` slug typo silently disables highlight. | Widget validates `currentApp` is in `user.apps`; logs a console warning in dev if not. (Production stays silent — a missing highlight is not user-facing breakage.) |
| App switcher list grows stale (new H-app onboarded, slug→URL map not updated). | Slug→URL map lives in `@coms-portal/shared`, version-controlled. Onboarding checklist includes "add to map." Future spec: serve the map from `/api/me/apps` so it's centrally managed. |

---

## Out of Scope (Confirmed)

- **Editable profile** (name, avatar, password, MFA) — Rev 4 candidate.
- **Notifications inbox** — widget reserves a slot, does not ship inbox.
- **Tenant switcher** — only relevant if a user belongs to multiple orgs; not a current product reality.
- **Theme switcher in widget** — theming stays in `@coms-portal/shared`; widget inherits.
- **Account switcher (multiple Google accounts in one browser)** — Google's OneGoogle does this; we do not multi-account today.

---

## Open Questions

1. **Should the widget render the role chip, or only the role name?** Portal's `/profile` page uses a chip (`apps/web/src/routes/(authed)/profile/+page.svelte:38`); the widget should match. Confirmed: chip.
2. ~~**Where does the slug→URL map for `appSwitcher` live?**~~ **Closed (2026-04-29).** `/api/userinfo` already returns the rich payload (`apps: [{slug, label, url}]` from `app_registry`); no separate `/api/me/apps` endpoint is needed. The static `APP_LAUNCHER` constant in `@coms-portal/shared` is a transitional artifact; chrome migration to the userinfo response is tracked in **Spec 03c**.
3. **Does the widget need a loading state?** No — host passes `user` server-side already; if `user` is null the host should not be rendering the widget at all. Widget treats null `user` as a programming error and renders nothing.
