# Heroes Team Handoff — Architecture Rev 1

> **From:** COMS Portal team
> **To:** COMS Heroes team
> **Date:** 2026-04-23
> **Repo:** `coms_aha_heroes`

---

## What's Happening

The portal team is shipping a set of architecture improvements to make the platform ready for onboarding additional services. Most changes are portal-internal, but **four items require changes in the Heroes repo**. This document explains exactly what, why, and in what order.

All portal-side specs are in `coms_portal/docs/architecture/rev1/`.

---

## Summary of Heroes Changes

| # | Change | Spec | Blocking? | Effort |
|---|--------|------|-----------|--------|
| H1 | Implement `user.provisioned` webhook handler | Spec 02 | No — runs in parallel with portal work | Small |
| H2 | Implement `user.updated` webhook handler | Spec 02 | No — same as above | Small |
| H3 | Replace duplicated types with `@coms-portal/shared` | Spec 03 | Yes — portal publishes the package first | Small |
| H4 | Add stale-while-revalidate to introspect client | Spec 04 | No — independent | Small |

Total estimated effort: ~1 day.

---

## H1: Implement `user.provisioned` Webhook Handler

### Why

When a portal admin adds an employee and grants their team access to Heroes, the portal sends a `user.provisioned` webhook. Today Heroes logs and ignores it:

```typescript
// packages/server/src/routes/portal-webhooks.ts:89-93
case 'user.provisioned':
case 'user.updated': {
  console.log(`[portal-webhook] ${event} — no-op`)
  break
}
```

This means new employees can't access Heroes until someone manually creates their user record in the Heroes DB.

### What to Do

In `packages/server/src/routes/portal-webhooks.ts`, replace the `user.provisioned` no-op:

1. Check if a user with this email already exists in the `users` table
2. If exists: update name and role if `appRole` is provided in the payload
3. If not exists: insert a new user with:
   - `email` from payload
   - `name` from payload
   - `role` mapped from `appRole` (portal sends one of: `admin`, `hr`, `leader`, `employee`) — direct 1:1 match with Heroes' `UserRole` enum
   - `branchId` — use a default/fallback branch (the team should decide which)
   - `canSubmitPoints: false`
   - `mustChangePassword: false` (portal handles auth)
   - `isActive: true`

### Payload Shape

The portal will send (after Spec 02 is shipped):

```json
{
  "contractVersion": 1,
  "event": "user.provisioned",
  "eventId": "uuid",
  "occurredAt": "2026-04-23T10:00:00Z",
  "appSlug": "heroes",
  "payload": {
    "userId": "portal-user-uuid",
    "gipUid": "firebase-uid",
    "email": "alice@company.com",
    "name": "Alice",
    "portalRole": "employee",
    "teamIds": ["team-uuid-1"],
    "apps": ["heroes"],
    "appRole": "leader"
  }
}
```

The `appRole` field is new. Until the portal ships Spec 02, it will be `null`/absent — Heroes should default to `'employee'` when `appRole` is missing.

### Type Update

Update `PortalEventBody` in `packages/server/src/routes/portal-webhooks.ts`:

```typescript
type PortalEventBody = {
  userId?: string
  gipUid?: string
  email?: string
  name?: string
  reason?: string
  notBefore?: string
  appRole?: string | null      // NEW
  changedFields?: string[]     // NEW
}
```

---

## H2: Implement `user.updated` Webhook Handler

### Why

When the portal admin updates an employee's name, email, or role, Heroes' local user record should reflect the change. Without this, name/email changes in the portal silently diverge from what Heroes shows.

### What to Do

In `packages/server/src/routes/portal-webhooks.ts`, replace the `user.updated` no-op:

1. Find the local user by email
2. Update `name` if provided
3. Update `role` if `appRole` is provided and maps to a valid `UserRole`
4. Log the update

### Payload Shape

```json
{
  "payload": {
    "userId": "portal-user-uuid",
    "email": "alice@company.com",
    "name": "Alice Updated",
    "portalRole": "employee",
    "teamIds": ["team-uuid-1"],
    "apps": ["heroes"],
    "appRole": "hr",
    "changedFields": ["name", "appRole"]
  }
}
```

---

## H3: Replace Duplicated Types with `@coms-portal/shared`

### Why

Heroes duplicates portal types locally. These are already drifting — `PortalSessionUser.portalRole` is typed as `string` in Heroes but as `PortalRole` (union type) in the portal.

### Prerequisites

The portal team will publish `@coms-portal/shared` as a Git-based dependency (GitHub repo `mrdoorba/coms-portal-shared`). This must be done before Heroes can consume it.

### What to Do

1. Add the dependency:
   ```bash
   bun add @coms-portal/shared@github:mrdoorba/coms-portal-shared#v1.0.0
   ```

2. Replace duplicated types:

   **`packages/shared/src/auth/session.ts`** — replace local `PortalSessionUser` with import:
   ```typescript
   import type { PortalSessionUser } from '@coms-portal/shared/contracts/auth'
   export type { PortalSessionUser }
   ```

   **`packages/web/src/lib/server/portal-broker.ts`** — replace local `PortalBrokerExchangePayload` and `WireResponse`:
   ```typescript
   import type { PortalBrokerExchangePayload, PortalBrokerHandoffResponse } from '@coms-portal/shared/contracts/auth'
   ```

3. Run `bun run typecheck` to verify.

### When

After the portal team notifies you that `@coms-portal/shared` v1.0.0 is published.

---

## H4: Add Stale-While-Revalidate to Introspect Client

### Why

If the portal goes down for > 30 seconds, Heroes' introspect client (`PortalIntrospectUnavailableError`) blocks all authenticated routes. Users who are already logged in and have valid local sessions get locked out.

### What to Do

Modify `packages/web/src/lib/server/portal-introspect.ts`:

1. Change the cache entry to track two timestamps: `freshUntil` and `staleUntil`
2. When the portal is reachable: serve fresh results (same as today, 30s TTL)
3. When the portal is unreachable AND a stale cache entry exists (< 5 min old): serve the stale result with a warning log instead of throwing
4. When the portal is unreachable AND no cache entry exists: still throw (can't validate an unknown session)

```typescript
// Current cache entry:
type CacheEntry = { result: IntrospectResult; expiresAt: number }

// New cache entry:
type CacheEntry = {
  result: IntrospectResult
  freshUntil: number   // now + 30s
  staleUntil: number   // now + 300s (5 min)
}
```

The key behavioral change:

```typescript
// Current: portal down → throw PortalIntrospectUnavailableError
// New:     portal down + stale cache → return stale cache + warn log
// New:     portal down + no cache    → throw PortalIntrospectUnavailableError (unchanged)
```

### When

This is independent of portal changes — can be done anytime.

---

## Manifest Update (Optional, Spec 02)

After the portal ships Spec 02 (app roles in the manifest), update `portal.integration.json` to declare Heroes' roles:

```json
{
  "appRoles": [
    { "key": "employee", "label": "Employee", "default": true, "description": "Standard user" },
    { "key": "leader", "label": "Team Leader", "description": "Can submit points for team members" },
    { "key": "hr", "label": "HR", "description": "Can manage users and view reports" },
    { "key": "admin", "label": "Administrator", "description": "Full access including settings" }
  ]
}
```

This enables the portal admin UI to show a role picker when granting teams access to Heroes.

---

## Coordination Timeline

```
Portal ships Spec 01 (security)        → No Heroes action needed
Portal ships Spec 02 (provisioning)    → Heroes does H1, H2, manifest update
Portal publishes @coms-portal/shared   → Heroes does H3
Heroes does H4 (introspect resilience) → Independent, anytime
Portal ships Spec 04 (health checks)   → No Heroes action needed
Portal ships Spec 05 (SSR, tasks)      → No Heroes action needed
```

H1, H2, and H4 can start immediately — they don't depend on any portal changes. H3 depends on the shared package being published.

---

## Questions / Blockers

If you have questions or blockers:
1. What should the default `branchId` be for auto-provisioned users? (H1 needs this)
2. Should auto-provisioned users get `canSubmitPoints: false` by default? (H1)
3. Any concerns about the role mapping (`appRole` → `UserRole`) being 1:1?

Reach out to the portal team with these answers or any other questions.
