/**
 * Provisioning event emitters — thin helpers that load fresh user state
 * from the database and fan out to subscribed webhook endpoints.
 *
 * All three functions are fire-and-forget from the caller's perspective:
 * dispatchPortalWebhook kicks off parallel deliveries and returns without
 * awaiting them, so these helpers are safe to call after a mutation commits
 * without blocking the response path.
 */

import { eq, inArray, and } from 'drizzle-orm'
import { db } from '~/db'
import { identityUsers, teamMembers, teamAppAccess, appRegistry, memberAppRole, appUserConfig } from '~/db/schema'
import { dispatchPortalWebhook } from './portal-webhook-fanout'
import { getDisplayEmail, getEmailEntries } from './email-resolution'
import type {
  UserProvisionedPayload,
  UserUpdatedPayload,
  UserOffboardedPayload,
  UserEmailEntry,
} from '@coms-portal/shared'
import type { PortalRole, PortalAppRole } from '@coms-portal/shared'

// ---------------------------------------------------------------------------
// Internal: resolve user + teams + app slugs from DB
// ---------------------------------------------------------------------------

interface ResolvedUserState {
  id: string
  gipUid: string | null
  email: string
  emails: UserEmailEntry[]
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
  memberRole: string | null
  appConfig: { config: Record<string, unknown>; schemaVersion: number } | null
}

async function resolveUserState(userId: string): Promise<ResolvedUserState | null> {
  const user = await db.query.identityUsers.findFirst({
    where: eq(identityUsers.id, userId),
  })

  if (!user) return null

  // Resolve display email per Q8a: workspace > personal-primary > first-personal
  const email = await getDisplayEmail(userId)
  // Resolve full emails array for additive Q8c webhook payload field
  const emails = await getEmailEntries(userId)

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
    email: email ?? '',
    emails,
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

async function resolvePerAppContext(userId: string, teamIds: string[]): Promise<ResolvedAppContext[]> {
  if (teamIds.length === 0) return []

  // Fetch all team-app grants (access gate only, no role)
  const grants = await db
    .select({
      appId: teamAppAccess.appId,
    })
    .from(teamAppAccess)
    .where(inArray(teamAppAccess.teamId, teamIds))

  if (grants.length === 0) return []

  const appIds = [...new Set(grants.map((g) => g.appId))]

  // Fetch each app's slug + declared appRoles
  const apps = await db
    .select({
      id: appRegistry.id,
      slug: appRegistry.slug,
      appRoles: appRegistry.appRoles,
    })
    .from(appRegistry)
    .where(inArray(appRegistry.id, appIds))

  // Fetch the user's per-member role assignments for these apps
  const userRoles = await db
    .select({
      appId: memberAppRole.appId,
      appRole: memberAppRole.appRole,
    })
    .from(memberAppRole)
    .where(
      and(
        eq(memberAppRole.userId, userId),
        inArray(memberAppRole.appId, appIds),
      ),
    )

  const roleByApp = new Map(userRoles.map((r) => [r.appId, r.appRole]))

  // Load per-user per-app config slices from app_user_config
  const configRows = await db
    .select({
      appId: appUserConfig.appId,
      config: appUserConfig.config,
      schemaVersion: appUserConfig.schemaVersion,
    })
    .from(appUserConfig)
    .where(
      and(
        eq(appUserConfig.portalSub, userId),
        inArray(appUserConfig.appId, appIds),
      ),
    )

  const configByApp = new Map(
    configRows.map((r) => [
      r.appId,
      { config: r.config as Record<string, unknown>, schemaVersion: r.schemaVersion },
    ]),
  )

  return apps.map((app) => ({
    appId: app.id,
    slug: app.slug,
    appRoles: app.appRoles ?? [],
    memberRole: roleByApp.get(app.id) ?? null,
    appConfig: configByApp.get(app.id) ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Internal: resolve the highest-priority app role for a user
// ---------------------------------------------------------------------------

/**
 * Resolves the app-local role for a user given their per-member role and
 * the app's declared role list.
 *
 * Priority:
 * 1. Explicit per-member role from member_app_role table.
 * 2. If no explicit role, fall back to the app's default role.
 * 3. If no default is declared, fall back to the first role in the list.
 * 4. If the app declares no roles at all, return null.
 */
export function resolveAppRoleForUser(
  memberRole: string | null,
  appRoles: PortalAppRole[],
): string | null {
  if (appRoles.length === 0) return null

  if (memberRole) return memberRole

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

  const perApp = await resolvePerAppContext(userId, state.teamIds)
  if (perApp.length === 0) return

  for (const app of perApp) {
    const appRole = resolveAppRoleForUser(app.memberRole, app.appRoles)

    // appConfig is additive — present once shared@v1.4.0 lands (Task 1).
    // Cast extends the base type rather than broadening it to unknown.
    const payload = {
      userId: state.id,
      gipUid: state.gipUid,
      email: state.email,
      emails: state.emails,
      name: state.name,
      portalRole: state.portalRole,
      teamIds: state.teamIds,
      apps: state.appSlugs,
      appRole,
      branch: state.branch,
      appConfig: app.appConfig,
    } as UserProvisionedPayload & { appConfig: typeof app.appConfig }

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

  const perApp = await resolvePerAppContext(userId, state.teamIds)
  if (perApp.length === 0) return

  for (const app of perApp) {
    const appRole = resolveAppRoleForUser(app.memberRole, app.appRoles)

    const payload: UserUpdatedPayload = {
      userId: state.id,
      gipUid: state.gipUid,
      email: state.email,
      emails: state.emails,
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
