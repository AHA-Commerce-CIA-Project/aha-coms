# Changelog

## v0.2.0 — Tailwind source registration

- Adds `./styles.css` export. Hosts must `@import "@coms-portal/account-widget/styles.css"` in their Tailwind v4 entry point so AccountWidget's class strings (including responsive utilities like `hidden sm:inline`) are scanned. Tailwind v4 excludes `node_modules` from auto-discovery, so without this import the responsive classes never make it into the host's compiled CSS. No code change to the widget itself — purely the source-registration contract. See README "Tailwind setup — required".

## v0.1.0 — initial widget API

- `AccountWidget` Svelte 5 component implementing spec-01 §Widget API (lines 105-132).
- Props: `currentApp`, `portalOrigin`, `user`, `appSwitcher`, `postLogoutRedirectUri?`, `notificationsSlot?`.
- Presentational only — host loads `user` server-side; widget never calls portal endpoints.
- `signOut()` helper performs RP-initiated OIDC logout via top-level browser navigation to `${portalOrigin}/api/auth/logout`.
- Dev-only console warning when `currentApp` is not in `user.apps`.

Version stays at `0.x.y` until Heroes adoption validates the API. Per spec-02 §Versioning, `v1.0.0` cuts when both portal and Heroes consume the package and have run in production for 7+ days.
