# Spec 02 — Provisioning Bridge

> Priority: **2 (enables multi-service)**
> Scope: Portal (primary) + Heroes (webhook handlers)
> Prerequisites: None (independent of Spec 01)

---

## Overview

Today, the portal manages identity (who you are, which apps you can access) and each service manages its own RBAC (what you can do inside the app). This is the right separation. The problem is the bridge between them:

- When a portal admin grants a team access to Heroes, Heroes doesn't know about the new users until they manually log in
- Heroes has no-op handlers for `user.provisioned` and `user.updated` webhooks
- The portal has no concept of app-local roles, so it can't tell Heroes "this user should be a leader"

This spec formalizes the provisioning bridge so that granting app access in the portal automatically provisions the user in the target service with the correct role.

---

## 1. App Roles in the Integration Manifest

### Current State

`packages/shared/src/contracts/integration-manifest.ts` defines `PortalIntegrationManifest` but has no concept of app-local roles.

Heroes defines its own roles in `packages/shared/src/constants/roles.ts`:

```typescript
export const USER_ROLES = ['admin', 'hr', 'leader', 'employee'] as const
```

The portal has no visibility into these.

### Target State

Each app declares its local roles in the integration manifest. The portal reads this to populate the admin UI.

### Contract Change

Add `appRoles` to `PortalIntegrationManifest` in `packages/shared/src/contracts/integration-manifest.ts`:

```typescript
export interface PortalAppRole {
  /** Machine key — stored in portal DB, sent in webhooks. e.g. 'leader' */
  key: string
  /** Human label for the portal admin UI. e.g. 'Team Leader' */
  label: string
  /** If true, this role is assigned when no explicit role is selected */
  default?: boolean
  /** Optional description shown in the portal admin UI */
  description?: string
}

export interface PortalIntegrationManifest {
  // ... existing fields ...

  /** App-local roles. The portal does not enforce these — it stores and
   *  forwards them. The app owns interpretation and fine-grained permissions. */
  appRoles?: PortalAppRole[]
}
```

### Heroes Manifest Update

`portal.integration.json` in the Heroes repo:

```json
{
  "appRoles": [
    { "key": "employee", "label": "Employee", "default": true, "description": "Standard user — can view points and rewards" },
    { "key": "leader", "label": "Team Leader", "description": "Can submit points for team members" },
    { "key": "hr", "label": "HR", "description": "Can manage users and view reports" },
    { "key": "admin", "label": "Administrator", "description": "Full access including settings" }
  ]
}
```

---

## 2. Store App Roles in Portal DB

### Current State

`app_registry` in `apps/api/src/db/schema/apps.ts` has no role storage.

### Target State

The portal stores the declared roles from each app's manifest so the admin UI can render a role picker.

### Schema Change

Add a JSONB column to `app_registry`:

```sql
ALTER TABLE app_registry
ADD COLUMN app_roles JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN app_registry.app_roles IS
  'App-declared local roles from portal.integration.json. Array of {key, label, default?, description?}.';
```

Drizzle schema in `apps/api/src/db/schema/apps.ts`:

```typescript
appRoles: jsonb('app_roles').$type<PortalAppRole[]>().notNull().default(sql`'[]'::jsonb`),
```

### Sync Mechanism

When an admin registers or updates an app, the `appRoles` field from the manifest (or manual input) is stored. No automatic manifest fetching in v1 — the admin pastes the manifest or the roles are submitted via the app registration API.

Future: an endpoint that the relying-party app calls on startup to push its manifest, auto-updating the roles.

---

## 3. Role Selection in Team-App Access Grant

### Current State

`team_app_access` in `apps/api/src/db/schema/apps.ts` tracks which teams can access which apps, but has no role column. All users in a granted team get access — the app decides their role on first login (or doesn't).

### Target State

When a portal admin grants a team access to an app, they can optionally select the default app-local role for that team's members.

### Schema Change

Add a column to `team_app_access`:

```sql
ALTER TABLE team_app_access
ADD COLUMN app_role VARCHAR(50) DEFAULT NULL;

COMMENT ON COLUMN team_app_access.app_role IS
  'Default app-local role for users in this team. NULL = use the app''s default role. Must match a key in app_registry.app_roles.';
```

Drizzle schema in `apps/api/src/db/schema/apps.ts`:

```typescript
// Add to teamAppAccess table:
appRole: varchar('app_role', { length: 50 }),
```

### Resolution Logic

When the portal provisions a user to an app:

1. Look up the user's team(s) that have access to this app
2. If `team_app_access.app_role` is set, use it
3. If multiple teams grant access with different roles, use the highest-privilege one (role hierarchy is defined by the app's `appRoles` order — first = highest)
4. If no role is specified, use the app's default role (the one with `default: true`)
5. If no default, use the first declared role

```typescript
function resolveAppRoleForUser(
  teamGrants: Array<{ appRole: string | null }>,
  appRoles: PortalAppRole[],
): string {
  // Explicit grants (filter nulls)
  const explicit = teamGrants.map(g => g.appRole).filter(Boolean) as string[]
  if (explicit.length > 0) {
    // Use the one with the lowest index in appRoles (= highest privilege)
    const roleOrder = appRoles.map(r => r.key)
    return explicit.sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b))[0]
  }

  // Fall back to app's default
  const defaultRole = appRoles.find(r => r.default)
  return defaultRole?.key ?? appRoles[0]?.key ?? 'employee'
}
```

### Admin UI Change

`apps/web/src/routes/(authed)/admin/teams/[id]/+page.svelte` — the team detail page where apps are granted. Add a dropdown for the app role when granting access:

- Fetch the app's `appRoles` from the registry
- Show a select element with the declared roles
- Default to the role marked `default: true`
- Submit the selected role alongside the `appId` in the grant API call

### API Change

`apps/api/src/routes/access.ts` — the team-app access grant endpoint:

- Accept optional `appRole` in the request body
- Validate that the role key exists in the target app's `app_roles`
- Store in `team_app_access.app_role`

---

## 4. Enriched Webhook Payloads

### Current State

`packages/shared/src/contracts/webhook-events.ts` defines:

```typescript
export interface UserProvisionedPayload {
  userId: string
  gipUid: string | null
  email: string
  name: string
  portalRole: PortalRole
  teamIds: string[]
  apps: string[]
}

export interface UserUpdatedPayload {
  userId: string
  gipUid: string | null
  email: string
  name: string
  portalRole: PortalRole
  teamIds: string[]
  apps: string[]
  changedFields: string[]
}
```

Neither payload includes the resolved app-local role or the employee's branch.

### Target State

Both payloads include the resolved app role and the employee's branch label for the target app.

### Contract Change

```typescript
export interface UserProvisionedPayload {
  userId: string
  gipUid: string | null
  email: string
  name: string
  portalRole: PortalRole
  teamIds: string[]
  apps: string[]
  /** The resolved app-local role for the recipient app. NULL if the app has no declared roles. */
  appRole: string | null
  /** The employee's office/country branch label (e.g. "Indonesia", "Thailand"). NULL if not set. */
  branch?: string | null
}

export interface UserUpdatedPayload {
  userId: string
  gipUid: string | null
  email: string
  name: string
  portalRole: PortalRole
  teamIds: string[]
  apps: string[]
  changedFields: string[]
  /** The current resolved app-local role for the recipient app. NULL if unchanged or no declared roles. */
  appRole: string | null
  /** The employee's office/country branch label (e.g. "Indonesia", "Thailand"). NULL if not set. */
  branch?: string | null
}
```

### Dispatch Change

`apps/api/src/services/webhook-dispatcher.ts` — `dispatchPortalWebhook()` already receives the app slug per endpoint. The caller must resolve the app role and include it in the payload.

The callers that dispatch `user.provisioned` and `user.updated` events (in `apps/api/src/services/employee-provisioning.ts` and related) need to:

1. Look up the user's team grants for the target app
2. Resolve the app role using the logic from section 3
3. Include `appRole` in the payload

Since webhooks fan out per-app, each endpoint receives a payload with its own `appRole` resolved.

---

## 5. Heroes Webhook Handler Implementation

### Current State

`coms_aha_heroes/packages/server/src/routes/portal-webhooks.ts:78-97`:

```typescript
switch (event) {
  case 'session.revoked':
  case 'user.offboarded': {
    // ... implemented ...
  }
  case 'user.provisioned':
  case 'user.updated': {
    console.log(`[portal-webhook] ${event} — no-op`)
    break
  }
}
```

### Target State

Heroes handles `user.provisioned` by creating a local user row and handles `user.updated` by syncing identity fields.

### Heroes `user.provisioned` Handler

When the portal sends `user.provisioned`, Heroes should:

1. Check if a user with this email already exists in `users` table
2. If yes: update fields that may have changed (name, role if `appRole` provided)
3. If no: create a new user with:
   - `email` from payload
   - `name` from payload
   - `role` from `appRole` (mapped to Heroes' `UserRole` enum) or default to `'employee'`
   - `branchId` — map from `branch` in the payload (e.g. `"Thailand"` → the Thai branch record). If no match or `branch` is null, fall back to a default branch
   - `canSubmitPoints` — default `false`
   - `mustChangePassword` — `false` (portal handles auth)
   - `isActive` — `true`

```typescript
case 'user.provisioned': {
  if (!body.email) break

  const roleMapping: Record<string, string> = {
    admin: 'admin',
    hr: 'hr',
    leader: 'leader',
    employee: 'employee',
  }
  const role = roleMapping[body.appRole ?? ''] ?? 'employee'

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, body.email))
    .limit(1)

  if (existing.length > 0) {
    await db.update(users)
      .set({ name: body.name ?? undefined, role, updatedAt: new Date() })
      .where(eq(users.id, existing[0].id))
  } else {
    // Map portal branch label to local branch; fall back to first branch
    const branchLabel = body.branch
    const [matched] = branchLabel
      ? await db.select({ id: branches.id }).from(branches)
          .where(eq(branches.code, branchLabel)).limit(1)
      : []
    const fallback = !matched
      ? await db.select({ id: branches.id }).from(branches).limit(1)
      : []
    const branchId = matched?.id ?? fallback[0]?.id

    await db.insert(users).values({
      email: body.email,
      name: body.name ?? body.email,
      role,
      branchId,
      canSubmitPoints: false,
      mustChangePassword: false,
      isActive: true,
    })
  }

  console.log(`[portal-webhook] ${event} — provisioned ${body.email} as ${role}`)
  break
}
```

### Heroes `user.updated` Handler

When the portal sends `user.updated`, Heroes should sync identity fields:

```typescript
case 'user.updated': {
  if (!body.email) break

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.name) updates.name = body.name
  if (body.appRole) {
    const roleMapping: Record<string, string> = { admin: 'admin', hr: 'hr', leader: 'leader', employee: 'employee' }
    if (roleMapping[body.appRole]) updates.role = roleMapping[body.appRole]
  }

  const result = await db.update(users)
    .set(updates)
    .where(eq(users.email, body.email))
    .returning({ id: users.id })

  console.log(`[portal-webhook] ${event} — updated ${result.length} user(s) for ${body.email}`)
  break
}
```

### Type Safety

The `PortalEventBody` type in `portal-webhooks.ts:7-13` needs updating to include `appRole` and `branch`:

```typescript
type PortalEventBody = {
  userId?: string
  gipUid?: string
  email?: string
  name?: string
  reason?: string
  notBefore?: string
  appRole?: string | null
  branch?: string | null
  changedFields?: string[]
}
```

---

## Implementation Order

1. **Portal: Contract changes** — add `PortalAppRole` and `appRoles` to manifest types, add `appRole` to webhook payload types (`packages/shared/`)
2. **Portal: Schema migration** — add `app_roles` to `app_registry`, `app_role` to `team_app_access`
3. **Portal: API changes** — role resolution logic, access grant API, webhook dispatch enrichment
4. **Portal: Admin UI** — role picker in team-app access grant
5. **Heroes: Manifest update** — add `appRoles` to `portal.integration.json`
6. **Heroes: Webhook handlers** — implement `user.provisioned` and `user.updated`
7. **Portal: Seed data** — populate `app_roles` for existing Heroes app from its manifest

Steps 5-6 are Heroes team work (see `heroes-team-handoff.md`).

---

## Files Modified

### Portal

| File | Change |
|------|--------|
| `packages/shared/src/contracts/integration-manifest.ts` | Add `PortalAppRole` interface, `appRoles` field |
| `packages/shared/src/contracts/webhook-events.ts` | Add `appRole` to provisioned/updated payloads |
| `apps/api/src/db/schema/apps.ts` | Add `appRoles` column to `app_registry`, `appRole` to `team_app_access` |
| `apps/api/src/routes/access.ts` | Accept `appRole` in grant request |
| `apps/api/src/services/apps.ts` | Store `appRoles` on register/update |
| `apps/api/src/services/employee-provisioning.ts` | Resolve and include `appRole` in webhook payloads |
| `apps/web/src/routes/(authed)/admin/teams/[id]/+page.svelte` | Role picker dropdown |
| New migration file | `drizzle-kit generate` |

### Heroes (see handoff doc)

| File | Change |
|------|--------|
| `portal.integration.json` | Add `appRoles` array |
| `packages/server/src/routes/portal-webhooks.ts` | Implement `user.provisioned` and `user.updated` handlers |
