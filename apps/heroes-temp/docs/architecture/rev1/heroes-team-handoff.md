# Heroes Team Handoff — Architecture Rev 1 (Retrospective)

> **From:** COMS Portal team
> **To:** COMS Heroes team
> **Original Date:** 2026-04-23
> **Retrospective Updated:** 2026-04-26
> **Repo:** `coms-aha-heroes`

---

## Status: COMPLETE

All four Heroes-side items from Rev 1 are shipped and verified against the codebase on 2026-04-26. This document is preserved as a retrospective record; for the current state of all Rev 1 work see `spec-00-implementation-timeline.md`. For the next round of cross-repo work see `../rev2/heroes-team-handoff.md`.

| # | Change | Spec | Status | Code reference |
|---|--------|------|--------|----------------|
| H1 | `user.provisioned` webhook handler | Spec 02 | **DONE** | `packages/server/src/routes/portal-webhooks.ts:101-159` |
| H2 | `user.updated` webhook handler | Spec 02 | **DONE** | `packages/server/src/routes/portal-webhooks.ts:160-190` |
| H3 | Replace duplicated types with `@coms-portal/shared` | Spec 03 | **DONE** | Consumes `@coms-portal/shared@v1.1.0`; `packages/shared/src/auth/session.ts` re-exports |
| H4 | Stale-while-revalidate on introspect client | Spec 04 | **DONE** | `packages/web/src/lib/server/portal-introspect.ts:15-19, 87-92, 113-120` |
| Manifest | Declare `appRoles` in `portal.integration.json` | Spec 02 | **DONE** | `portal.integration.json:76-81` |

---

## What Was Delivered

### H1 — `user.provisioned`

Email-keyed lookup; updates name and role on existing users; creates new user with `branchId` resolved from `body.branch` against `branches.code` (with default-branch fallback when unmatched or null), `canSubmitPoints: false`, `mustChangePassword: false`, `isActive: true`. Role mapping passes through `toUserRole()` (validates against the `USER_ROLES` const) and defaults to `'employee'` when missing or unrecognized.

### H2 — `user.updated`

Email-keyed update; applies `name` if provided, `role` if `appRole` provided and maps to a valid `UserRole`. No-op + log when no applicable fields. Logs missing-local-user for visibility.

### H3 — Shared package

Heroes consumes `@coms-portal/shared@v1.1.0` directly from the Git repo `mrdoorba/coms-shared`. Local `PortalSessionUser`, `PortalBrokerExchangePayload`, and `WireResponse` types removed in favor of shared imports. Branch types now ride along, eliminating the `string` vs. `PortalRole` drift the Rev 1 spec called out.

### H4 — Stale-while-revalidate introspect

Two-tier cache (`freshUntil = now + 30s`, `staleUntil = now + 300s`). On retry exhaustion, if a stale cache entry exists within `staleUntil` the result is served with `console.warn`; otherwise `PortalIntrospectUnavailableError` is thrown (preserves original semantic for unknown sessions). Handles 401 (misconfig), 404 (unknown user → revoked), 503 (transient), and treats network errors as 503.

### Manifest update

`appRoles` array declares `employee` (default), `leader`, `hr`, `admin` with descriptions.

---

## Known Gap (Tracked Separately)

The H4 stale-serve path emits `console.warn` only — Spec 04 §1 also calls for severity escalation to `severity: 'ERROR'` after N stale-serves in a window plus a Cloud Monitoring alert policy. Without that, a multi-minute portal outage is invisible unless someone tails logs manually.

This is tracked as Rev 2 spec-05 (`../rev2/spec-05-stale-serve-alerting.md`) — a small Heroes-only follow-up.

---

## Resolved Questions

1. ~~What should the default `branchId` be for auto-provisioned users?~~ — Resolved. Portal sends `branch` (e.g. `"Thailand"`) in webhook payload; Heroes matches against `branches.code`, falls back to first branch on miss.
2. ~~Should auto-provisioned users get `canSubmitPoints: false` by default?~~ — Yes; shipped that way.
3. ~~Any concerns about the role mapping (`appRole` → `UserRole`) being 1:1?~~ — None; 1:1 confirmed in `toUserRole()`.

---

## Next Round

See `../rev2/heroes-team-handoff.md` for Rev 2 cross-repo work. TL;DR: Rev 2 closes out the remaining shared-secret surfaces (broker tokens → RS256 + JWKS, webhook auth → Google OIDC, introspect auth → Google OIDC). Heroes will need to update verification code in three places, all small.
