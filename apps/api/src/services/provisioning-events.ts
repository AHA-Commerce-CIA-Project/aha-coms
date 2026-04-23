/**
 * Provisioning event emitters — thin helpers that load fresh user state
 * from the database and fan out to subscribed webhook endpoints.
 *
 * All three functions are fire-and-forget from the caller's perspective:
 * dispatchPortalWebhook kicks off parallel deliveries and returns without
 * awaiting them, so these helpers are safe to call after a mutation commits
 * without blocking the response path.
 */

import { eq, inArray } from 'drizzle-orm'
import { db } from '~/db'
import { identityUsers, teamMembers, teamAppAccess, appRegistry } from '~/db/schema'
import { dispatchPortalWebhook } from './portal-webhook-fanout'
import type {
  UserProvisionedPayload,
  UserUpdatedPayload,
  UserOffboardedPayload,
} from '@coms-portal/shared'
import type { PortalRole, PortalAppRole } from '@coms-portal/shared'

// ---------------------------------------------------------------------------
// Internal: resolve user + teams + app slugs from DB
// ---------------------------------------------------------------------------

interface ResolvedUserState {
  id: string
  gipUid: string | null
  email: string
  name: string
  portalRole: PortalRole
  branch: string | null
  teamIds: string[]
  appSlugs: string[]
}

/** Per-app data needed for role resolution and per-app dispatch */
interface ResolvedAppContext {
  appId: string
  slug: string
  appRoles: PortalAppRole[]
  teamGrants: Array<{ appRole: string | null }>
}

async function resolveUserState(userId: string): Promise<ResolvedUserState | null> {
  const user = await db.query.identityUsers.findFirst({
    where: eq(identityUsers.id, userId),
  })

  if (!user) return null

  const memberships = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))

  const teamIds = memberships.map((m) => m.teamId)

  let appSlugs: string[] = []
  if (teamIds.length > 0) {
    const access = await db
      .select({ appId: teamAppAccess.appId })
      .from(teamAppAccess)
      .where(inArray(teamAppAccess.teamId, teamIds))

    const appIds = [...new Set(access.map((a) => a.appId))]

    if (appIds.length > 0) {
      const apps = await db
        .select({ slug: appRegistry.slug })
        .from(appRegistry)
        .where(inArray(appRegistry.id, appIds))

      appSlugs = apps.map((a) => a.slug)
    }
  }

  return {
    id: user.id,
    gipUid: user.gipUid ?? null,
    email: user.email,
    name: user.name,
    portalRole: user.portalRole as PortalRole,
    branch: user.branch ?? null,
    teamIds,
    appSlugs,
  }
}

// ---------------------------------------------------------------------------
// Internal: resolve per-app context (team grants + declared roles)
// ---------------------------------------------------------------------------

async function resolvePerAppContext(teamIds: string[]): Promise<ResolvedAppContext[]> {
  if (teamIds.length === 0) return []

  // Fetch all team-app grants with their appRole for the user's teams
  const grants = await db
    .select({
      appId: teamAppAccess.appId,
      appRole: teamAppAccess.appRole,
    })
    .from(teamAppAccess)
    .where(inArray(teamAppAccess.teamId, teamIds))

  if (grants.length === 0) return []

  // Group grants by appId
  const grantsByApp = new Map<string, Array<{ appRole: string | null }>>()
  for (const g of grants) {
    const list = grantsByApp.get(g.appId)
    if (list) {
      list.push({ appRole: g.appRole })
    } else {
      grantsByApp.set(g.appId, [{ appRole: g.appRole }])
    }
  }

  const appIds = [...grantsByApp.keys()]

  // Fetch each app's slug + declared appRoles
  const apps = await db
    .select({
      id: appRegistry.id,
      slug: appRegistry.slug,
      appRoles: appRegistry.appRoles,
    })
    .from(appRegistry)
    .where(inArray(appRegistry.id, appIds))

  return apps.map((app) => ({
    appId: app.id,
    slug: app.slug,
    appRoles: app.appRoles ?? [],
    teamGrants: grantsByApp.get(app.id) ?? [],
  }))
}

// ---------------------------------------------------------------------------
// Internal: resolve the highest-priority app role for a user
// ---------------------------------------------------------------------------

/**
 * Resolves the app-local role for a user given their team grants and the app's
 * declared role list.
 *
 * Priority:
 * 1. Explicit roles from team grants — pick the one earliest in the app's
 *    declared role order (highest priority).
 * 2. If no explicit role, fall back to the app's default role.
 * 3. If no default is declared, fall back to the first role in the list.
 * 4. If the app declares no roles at all, return null.
 */
export function resolveAppRoleForUser(
  teamGrants: Array<{ appRole: string | null }>,
  appRoles: PortalAppRole[],
): string | null {
  if (appRoles.length === 0) return null

  const explicit = teamGrants.map((g) => g.appRole).filter(Boolean) as string[]
  if (explicit.length > 0) {
    const roleOrder = appRoles.map((r) => r.key)
    return explicit.sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b))[0]
  }

  const defaultRole = appRoles.find((r) => r.default)
  return defaultRole?.key ?? appRoles[0]?.key ?? 'employee'
}

// ---------------------------------------------------------------------------
// Public emitters
// ---------------------------------------------------------------------------

/**
 * Emit user.provisioned after a new identity_users row has been committed
 * and initial provisioning has run.
 *
 * Dispatches one webhook per app the user has access to, each with the
 * correct resolved appRole for that specific app.
 *
 * Edge case: a freshly-created user with no team memberships has no apps,
 * so no webhooks are dispatched. This is intentional.
 */
export async function emitUserProvisioned(userId: string): Promise<void> {
  const state = await resolveUserState(userId)
  if (!state) return

  const perApp = await resolvePerAppContext(state.teamIds)
  if (perApp.length === 0) return

  for (const app of perApp) {
    const appRole = resolveAppRoleForUser(app.teamGrants, app.appRoles)

    const payload: UserProvisionedPayload = {
      userId: state.id,
      gipUid: state.gipUid,
      email: state.email,
      name: state.name,
      portalRole: state.portalRole,
      teamIds: state.teamIds,
      apps: state.appSlugs,
      appRole,
      branch: state.branch,
    }

    await dispatchPortalWebhook('user.provisioned', payload, {
      appSlugs: [app.slug],
    })
  }
}

/**
 * Emit user.updated after profile fields or role/team memberships change.
 *
 * changedFields should contain only the field names that were actually
 * modified (e.g. ['email', 'portalRole'], ['teamIds'], ['apps']).
 *
 * Dispatches one webhook per app the user has access to, each with the
 * correct resolved appRole for that specific app.
 */
export async function emitUserUpdated(userId: string, changedFields: string[]): Promise<void> {
  const state = await resolveUserState(userId)
  if (!state) return

  const perApp = await resolvePerAppContext(state.teamIds)
  if (perApp.length === 0) return

  for (const app of perApp) {
    const appRole = resolveAppRoleForUser(app.teamGrants, app.appRoles)

    const payload: UserUpdatedPayload = {
      userId: state.id,
      gipUid: state.gipUid,
      email: state.email,
      name: state.name,
      portalRole: state.portalRole,
      teamIds: state.teamIds,
      apps: state.appSlugs,
      changedFields,
      appRole,
      branch: state.branch,
    }

    await dispatchPortalWebhook('user.updated', payload, {
      appSlugs: [app.slug],
    })
  }
}

/**
 * Emit user.offboarded after a user has been deactivated.
 *
 * NOTE: This must be called AFTER the deactivation mutation commits and AFTER
 * revokePortalSession fires (so the offboarded event follows session.revoked
 * in the delivery order). The app list used here is the post-deactivation
 * state: the user's team memberships and app access rows are still present
 * in the database (deactivation only sets status='inactive'), so the slug
 * list is still accurate for fanout. This is the simplest correct approach.
 */
export async function emitUserOffboarded(userId: string): Promise<void> {
  const state = await resolveUserState(userId)
  if (!state) {
    // User row gone — nothing to emit
    return
  }

  const payload: UserOffboardedPayload = {
    userId: state.id,
    gipUid: state.gipUid,
    email: state.email,
    offboardedAt: new Date().toISOString(),
  }

  await dispatchPortalWebhook('user.offboarded', payload, {
    appSlugs: state.appSlugs.length > 0 ? state.appSlugs : undefined,
  })
}
