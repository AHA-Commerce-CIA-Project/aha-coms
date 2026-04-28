# Changelog

## v0.1.0 — initial widget API

- `AccountWidget` Svelte 5 component implementing spec-01 §Widget API (lines 105-132).
- Props: `currentApp`, `portalOrigin`, `user`, `appSwitcher`, `postLogoutRedirectUri?`, `notificationsSlot?`.
- Presentational only — host loads `user` server-side; widget never calls portal endpoints.
- `signOut()` helper performs RP-initiated OIDC logout via top-level browser navigation to `${portalOrigin}/api/auth/logout`.
- Dev-only console warning when `currentApp` is not in `user.apps`.

Version stays at `0.x.y` until Heroes adoption validates the API. Per spec-02 §Versioning, `v1.0.0` cuts when both portal and Heroes consume the package and have run in production for 7+ days.
