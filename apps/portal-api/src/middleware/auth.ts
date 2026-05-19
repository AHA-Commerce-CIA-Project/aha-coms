import { Elysia } from 'elysia'
import type { PortalClaims } from '@coms-portal/shared'
import { db } from '~/db'
import { teamMembers, teamAppAccess, appRegistry } from '~/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { getSessionCookieValue } from './session-cookie'
import { validateSession, type SessionUser } from '../services/sessions'
import { getDisplayEmail } from '../services/email-resolution'

export interface AuthUser {
  id: string
  gipUid: string
  email: string
  name: string
  /**
   * The portal role for this user. `super_admin` is an internal portal concept
   * not surfaced in PortalClaims to relying-party apps. For claim-forwarding
   * purposes treat it the same as 'admin' (highest rank wins in hasPortalRole).
   */
  portalRole: PortalClaims['portalRole'] | 'super_admin'
  teamIds: string[]
  apps: string[]
  /**
   * Spec 06 PR F §1: forwarded from the underlying SessionUser. Tells the
   * portal-web `(authed)` layout to redirect to /onboarding/set-password
   * until the user POSTs to /api/auth/password/set.
   */
  passwordSetupRequired: boolean
}

export class AuthResolutionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 401 | 403,
  ) {
    super(message)
  }
}

/**
 * Enrich a validated SessionUser with teamIds, appSlugs, and display email.
 *
 * The identity status check and session validity check are already done by
 * `validateSession`; we trust the SessionUser and only resolve the relational
 * data that `authPlugin` consumers need (teamIds, apps, email).
 */
export async function resolveAuthUser(sessionUser: SessionUser): Promise<AuthUser> {
  // Resolve teamIds and apps from DB so changes take effect immediately
  // without requiring the user to re-login.
  const memberships = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, sessionUser.id))

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

  // Resolve display email per Q8a: workspace > primary personal > first personal
  const email = await getDisplayEmail(sessionUser.id)

  return {
    id: sessionUser.id,
    gipUid: sessionUser.gipUid ?? '',
    email: email ?? '',
    name: sessionUser.name,
    portalRole: sessionUser.portalRole as AuthUser['portalRole'],
    teamIds,
    apps: appSlugs,
    passwordSetupRequired: sessionUser.passwordSetupRequired,
  }
}

/**
 * Elysia plugin that validates the portal session cookie on every request.
 * Injects `authUser` and `sessionId` into the Elysia context.
 * Returns 401 if cookie is missing, invalid, expired, or revoked.
 */
export const authPlugin = new Elysia({ name: 'auth-plugin' }).derive(
  { as: 'scoped' },
  async ({ request, status }) => {
    const cookieHeader = request.headers.get('cookie') ?? ''
    const sessionCookie = getSessionCookieValue(cookieHeader)

    if (!sessionCookie) {
      throw status(401, { message: 'No session cookie' })
    }

    const sessionUser = await validateSession(sessionCookie)
    if (!sessionUser) {
      throw status(401, { message: 'Invalid or expired session' })
    }

    try {
      const authUser = await resolveAuthUser(sessionUser)
      // Expose sessionId so logout and other routes know which session to revoke
      return {
        authUser,
        sessionId: sessionUser.sessionId,
        // Spec 06 PR F §1: propagate the per-session forced-set flag so route
        // handlers can apply the belt-and-suspenders gate alongside the layout
        // guard.
        passwordSetupRequired: sessionUser.passwordSetupRequired,
      }
    } catch (error) {
      if (error instanceof AuthResolutionError) {
        throw status(error.statusCode, { message: error.message })
      }
      throw error
    }
  },
)
