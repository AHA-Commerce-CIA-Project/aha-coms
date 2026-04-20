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
import { dispatchPortalWebhook } from './webhook-dispatcher'
import type {
  UserProvisionedPayload,
  UserUpdatedPayload,
  UserOffboardedPayload,
} from '@coms-portal/shared'
import type { PortalRole } from '@coms-portal/shared'

// ---------------------------------------------------------------------------
// Internal: resolve user + teams + app slugs from DB
// ---------------------------------------------------------------------------

interface ResolvedUserState {
  id: string
  gipUid: string | null
  email: string
  name: string
  portalRole: PortalRole
  teamIds: string[]
  appSlugs: string[]
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
    teamIds,
    appSlugs,
  }
}

// ---------------------------------------------------------------------------
// Public emitters
// ---------------------------------------------------------------------------

/**
 * Emit user.provisioned after a new identity_users row has been committed
 * and initial provisioning has run.
 *
 * Edge case: a freshly-created user with no team memberships has no appSlugs,
 * so dispatchPortalWebhook finds no endpoints and is effectively a no-op.
 * This is intentional — there is nothing to fan out to yet.
 */
export async function emitUserProvisioned(userId: string): Promise<void> {
  const state = await resolveUserState(userId)
  if (!state) return

  const payload: UserProvisionedPayload = {
    userId: state.id,
    gipUid: state.gipUid,
    email: state.email,
    name: state.name,
    portalRole: state.portalRole,
    teamIds: state.teamIds,
    apps: state.appSlugs,
  }

  await dispatchPortalWebhook('user.provisioned', payload, {
    appSlugs: state.appSlugs.length > 0 ? state.appSlugs : undefined,
  })
}

/**
 * Emit user.updated after profile fields or role/team memberships change.
 *
 * changedFields should contain only the field names that were actually
 * modified (e.g. ['email', 'portalRole'], ['teamIds'], ['apps']).
 */
export async function emitUserUpdated(userId: string, changedFields: string[]): Promise<void> {
  const state = await resolveUserState(userId)
  if (!state) return

  const payload: UserUpdatedPayload = {
    userId: state.id,
    gipUid: state.gipUid,
    email: state.email,
    name: state.name,
    portalRole: state.portalRole,
    teamIds: state.teamIds,
    apps: state.appSlugs,
    changedFields,
  }

  await dispatchPortalWebhook('user.updated', payload, {
    appSlugs: state.appSlugs.length > 0 ? state.appSlugs : undefined,
  })
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
