# Rev 3 — Spec 04: Unified User Preferences (Theme + Language)

> Priority: **Deferred. Not critical-path; ships when the third H-app onboards or users report drift.**
> Scope: Portal (preferences endpoint, ID-token claim, broadcast mechanism) + every H-app (consume preference, render in shared chrome).
> Prerequisites: Rev 3 Spec 01 (account widget — preference UI lives in the widget popover).

---

## Overview

Today the suite has two visible UI preferences that should feel suite-wide but aren't:

1. **Theme (light / dark / system).** Heroes has its own toggle. Portal has its own toggle. They don't sync. A user who flips dark mode in Heroes opens portal in light mode the next tab.
2. **Language.** Heroes uses inlang/Paraglide for i18n. Portal does not yet have i18n at all. Once portal localizes, the two need to agree on the active locale or the suite will speak two languages at once.

Big-vendor reference behavior:

- **Google:** theme + language are account-level, set in account settings, broadcast to every product via the cookie ring. Switching language in Gmail switches it in Drive on the next request.
- **Microsoft 365:** theme + language are tenant- or user-level, persisted in user profile, every M365 surface reads the same setting on render.
- **AWS Console:** theme is account-level, persisted server-side, applied via session.

The unifying pattern: **preference lives on the identity service (portal), not the consumer apps.** Apps render against it; they do not store their own copy.

This spec defines that mechanism for the COMS suite.

---

## Why this is deferred

With **two apps in the suite**, drift is barely perceptible — most users live in one app at a time. The "this doesn't feel like one product" complaint that justifies a unified-preference layer surfaces around the **third H-app**, when users genuinely move between three contexts in a session.

Building it now means committing to a persistence shape (cookie ring vs `/api/me/preferences` vs ID-token claim vs hybrid) before we know which constraint will bite. The right design becomes obvious once a third H-app onboards and we feel the actual friction.

So: full architecture decided here; implementation deferred.

### Triggers to ship

Any one of these unblocks Phase 1 implementation:

1. **A third H-app onboards.** N=3 is the inflection point where preference drift becomes a complaint, not a curiosity.
2. **Portal localizes.** The moment portal renders in two languages, the contract for which one is active becomes load-bearing — apps need to know which locale to fetch translations for.
3. **A user-visible drift incident.** A support ticket like "I set dark mode in Heroes but portal keeps showing light" is a sufficient trigger.
4. **Spec 02 Phase 2+ ships.** The design system's tokens carry theme awareness; the preference contract needs to exist before tokens compile against it.

---

## Decisions Up Front

### Persistence: portal-owned table, served via ID-token claim + endpoint

A new `user_preferences` table on the portal, one row per `identity_users.id`:

```ts
export const userPreferences = pgTable('user_preferences', {
  identityUserId: uuid('identity_user_id').primaryKey()
    .references(() => identityUsers.id, { onDelete: 'cascade' }),
  theme: varchar('theme', { length: 16 }).notNull().default('system'),
    // 'light' | 'dark' | 'system'
  locale: varchar('locale', { length: 10 }).notNull().default('en'),
    // BCP-47 — 'en', 'en-US', 'id', 'ja', etc.
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

Surfaced two ways:

1. **ID-token claim.** Portal embeds `coms_prefs: { theme, locale }` as a private claim in the OIDC ID token (Rev 2 Spec 01 carries app claims; this slots alongside). Apps verify the token, read the prefs, render. Zero round-trips.
2. **`GET /api/me/preferences` + `PATCH /api/me/preferences`.** For mid-session updates without a full re-auth. Returns same shape.

ID-token carries the *state at login*. The endpoint carries *current state* and is what the widget calls when the user flips a toggle.

### Why not a cookie ring (Google's model)

Cookie rings (one cookie shared across `*.example.com` subdomains) are simple and avoid round-trips, but they require:

- Every app on the same parent domain (we have `coms.ahacommerce.net` planned but H-apps may live on their own domains long-term).
- Trusting the cookie's integrity without re-verification (anyone with `coms.ahacommerce.net` write access can mint).
- Browser cookie quirks across SameSite, Partitioned, third-party-cookie deprecation.

The ID-token claim path reuses the OIDC trust chain we already have. Mid-session updates are infrequent (a user flips dark mode once a day, not once a request) so the endpoint round-trip is acceptable.

### Broadcast on update: BroadcastChannel + token refresh

When a user changes theme in one tab, every other tab of any COMS app should pick it up. Mechanism:

1. The widget calls `PATCH /api/me/preferences`.
2. Portal updates the row, returns the new state.
3. The widget posts to a `BroadcastChannel('coms-prefs')` on the same origin. **Same-origin only** — cross-origin BroadcastChannel doesn't exist; cross-app sync needs (4) or (5).
4. Each tab listens on `BroadcastChannel('coms-prefs')` and applies. Other tabs of the *same app* update instantly.
5. Tabs of *other apps* (different origin) pick up the change either on next navigation (their server-side load reads the fresh preference via the endpoint) or via a portal-served `EventSource` / polling — defer that decision to implementation; for v1, "next navigation" is acceptable.

### UI surface lives in the account widget popover

Theme toggle and language selector both live inside the `<AccountWidget>` popover (Spec 01) — not in the service bar, not as separate icons. Reasons:

- Account widget is already the place for "things about me." Preferences are about-me.
- Big-vendor reference: Google and Microsoft both put theme + language inside the account menu.
- Prevents proliferation of icons in the chrome.

The widget gets two new props (or, more cleanly, reads them from the user/preferences shape passed via existing props):

```ts
preferences: {
  theme: 'light' | 'dark' | 'system'
  locale: string
}
onPreferenceChange?: (next: { theme?: ...; locale?: ... }) => void
```

Host wires `onPreferenceChange` to a server action that calls `PATCH /api/me/preferences` and re-runs the load function so SSR re-renders with the new state.

### Default values and unauthenticated state

- **Unauthenticated** users get `theme: 'system'` and `locale: <browser-default>`. Stored client-side only (localStorage).
- **First login** — portal seeds the row with `theme: 'system'`, `locale: 'en'` (or detected browser locale at signup time, if present).
- **System theme** is the explicit "follow OS" mode and is the default. Avoids surprising users who haven't picked a preference.

### Locale set is portal-controlled

Portal publishes a `GET /api/locales` endpoint listing supported locales for the suite. Apps that want to render their language picker call this — they don't hardcode their own list. Initial set is whatever portal supports (likely `en`, `id`); H-apps that have additional translations propose their locales upstream and get them added.

Apps must gracefully fall back when the user's locale doesn't have a translation in that app — fall back to `en`, do not 500.

---

## Phasing

### Phase 1 — Schema + endpoint + ID-token claim (portal-only, ~3 days)

- Add `user_preferences` table.
- `GET /api/me/preferences` and `PATCH /api/me/preferences`.
- Embed `coms_prefs` claim in ID token.
- Add `GET /api/locales` returning the portal-supported list.

Ships independently; no app-side work yet. Apps that ignore the claim continue to work.

### Phase 2 — Widget surface (Spec 01 follow-up, ~2 days)

- Add theme toggle + language selector to `<AccountWidget>` popover.
- Wire `onPreferenceChange` to `PATCH` endpoint + `BroadcastChannel`.
- Portal app dogfoods first.

### Phase 3 — Heroes adoption (~3 days)

- Heroes reads `coms_prefs` from ID token on session load.
- Theme: Heroes' Tailwind dark-class toggle reads from preference, not localStorage.
- Locale: Paraglide active locale derives from preference.
- Heroes' own theme toggle (if any standalone exists) is removed; only the widget controls it.

### Phase 4 — Future H-apps adopt (~ongoing)

- Onboarding playbook (`coms-ui/ONBOARDING.md`) gains a section: "Read `coms_prefs` from the ID token, apply theme + locale on render, do not ship your own toggle."

---

## Out of Scope

- **Per-app preference overrides.** No "dark in Heroes, light in portal." That defeats the purpose. If a user wants different theming in different apps, they'll learn to live with one suite-wide setting; the value of unification > the value of per-app divergence.
- **Other preferences (notification settings, timezone, currency, accessibility flags).** This spec covers only theme + locale. Other preferences are domain-specific or higher-stakes and need their own design.
- **Real-time push to other apps' tabs.** Cross-origin BroadcastChannel-equivalent (likely SSE from portal) is deferred — "applies on next navigation" is acceptable for v1.

---

## Success Criteria

Phase 1 done when portal has the table, endpoints, and ID-token claim landed. Apps that ignore the claim still work.

Full Spec 04 done when:

1. A user flips theme in the account widget on portal; opening Heroes (new tab, same browser) shows the new theme on first paint, no flicker.
2. Same for locale — Heroes renders in the user's selected language without a per-app toggle.
3. Heroes does not have its own dark-mode toggle; the widget is the only entry point.
4. A third H-app onboards by reading the ID token claim and consuming `@coms-portal/ui`'s theme tokens — zero new preference state in that app.
5. The user's preference persists across logout/login cycles (it's portal-side, not browser-side).
