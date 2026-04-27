import { timingSafeEqual } from 'node:crypto'
import { Elysia, t } from 'elysia'
import {
  verifyIdToken,
  createSessionCookie,
  verifySessionCookie,
} from '../gip-admin'
import { db } from '~/db'
import { identityUsers, sessionRevocations, teamMembers, appRegistry } from '~/db/schema'
import { eq, and, gte } from 'drizzle-orm'
import {
  type PortalBrokerExchangePayload,
  type PortalSessionUser,
  SESSION_COOKIE_OPTIONS,
} from '@coms-portal/shared'
import { resolveAndSyncClaims } from '../services/claims'
import { getSessionCookieValue } from '../middleware/session-cookie'
import { resolveAuthUser } from '../middleware/auth'
import {
  BrokerAuthorizationError,
  BrokerValidationError,
  createBrokerHandoff,
  exchangeBrokerHandoff,
  findBrokerAppBySlug,
} from '../services/auth-broker'
import {
  revokePortalSession,
  listAppSlugsForUser,
  type RevocationReason,
} from '../services/session-revocation'
import { verifyGoogleIdToken } from '../services/oidc-verifier'

const SELF_AUDIENCE =
  process.env.PORTAL_PUBLIC_ORIGIN ?? 'https://coms.ahacommerce.net'

/**
 * Dual-mode authenticator for the broker/introspect endpoint.
 *
 * 1. Tries OIDC first: if `Authorization: Bearer <token>` header is present
 *    and the app has a `serviceAccountEmail` configured, verify the Google ID
 *    token against that SA email. On success → { via: 'oidc', ok: true }.
 *    On failure → fall through (dual-mode).
 *
 * 2. Falls back to legacy shared-secret header (`x-portal-introspect-secret`).
 *    On match → { via: 'secret', ok: true } with a migration warning.
 *
 * 3. Neither succeeds → { via: 'oidc', ok: false }.
 *
 * The caller is responsible for 401 handling. App lookup happens once here.
 * Returns { via: 'oidc', ok: false } if the app slug is not found so the
 * caller sees a clean 401 rather than leaking whether a slug exists.
 */
async function authenticateIntrospectCaller(
  request: Request,
  appSlug: string,
): Promise<{ via: 'oidc' | 'secret'; ok: boolean }> {
  const app = await db.query.appRegistry.findFirst({
    where: eq(appRegistry.slug, appSlug),
    columns: { introspectSecret: true, serviceAccountEmail: true },
  })

  if (!app) return { via: 'oidc', ok: false }

  const authHeader = request.headers.get('authorization')

  // --- Try OIDC first ---
  if (authHeader?.startsWith('Bearer ') && app.serviceAccountEmail) {
    try {
      await verifyGoogleIdToken({
        idToken: authHeader.slice(7),
        expectedAudience: SELF_AUDIENCE,
        expectedSAEmail: app.serviceAccountEmail,
      })
      return { via: 'oidc', ok: true }
    } catch {
      // fall through during dual-mode
    }
  }

  // --- Fall back to legacy shared-secret header ---
  const expectedSecret = app.introspectSecret ?? process.env.PORTAL_INTROSPECT_SECRET
  if (expectedSecret) {
    const provided = request.headers.get('x-portal-introspect-secret') ?? ''
    if (
      provided.length === expectedSecret.length &&
      timingSafeEqual(Buffer.from(provided), Buffer.from(expectedSecret))
    ) {
      console.warn(
        `[introspect] app "${appSlug}" used legacy secret auth — migrate to OIDC`,
      )
      return { via: 'secret', ok: true }
    }
  }

  return { via: 'oidc', ok: false }
}

async function resolveSessionUser(request: Request): Promise<PortalSessionUser> {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const sessionCookie = getSessionCookieValue(cookieHeader)

  if (!sessionCookie) {
    throw new BrokerValidationError('Not authenticated')
  }

  const decoded = await verifySessionCookie(sessionCookie)
  return resolveAuthUser(decoded)
}

export const authRoutes = new Elysia({ prefix: '/auth' })
  /**
   * POST /api/auth/session
   * Exchange a Firebase ID token for a server-managed session cookie.
   * Returns 403 if the email is not pre-provisioned in identity_users.
   */
  .post(
    '/session',
    async ({ body, set, cookie }) => {
      let decoded
      try {
        decoded = await verifyIdToken(body.idToken)
      } catch (e) {
        console.error('verifyIdToken failed:', e)
        set.status = 401
        return { message: e instanceof Error ? e.message : 'Invalid token' }
      }

      // Closed registration: only pre-provisioned employees may log in
      const user = await db.query.identityUsers.findFirst({
        where: eq(identityUsers.email, decoded.email ?? ''),
      })

      if (!user) {
        set.status = 403
        return { message: 'Access denied. Contact your administrator.' }
      }

      if (user.status !== 'active') {
        set.status = 403
        return { message: 'Account is inactive or suspended.' }
      }

      // Link GIP UID on first login if not yet stored
      if (!user.gipUid) {
        await db
          .update(identityUsers)
          .set({ gipUid: decoded.uid, updatedAt: new Date() })
          .where(eq(identityUsers.id, user.id))
      }

      // Sync custom claims (portalRole, teamIds, apps)
      await resolveAndSyncClaims(user.gipUid ?? decoded.uid, user.id)

      const expiresIn = SESSION_COOKIE_OPTIONS.maxAge * 1000
      const sessionCookie = await createSessionCookie(body.idToken, expiresIn)

      cookie[SESSION_COOKIE_OPTIONS.name].set({
        value: sessionCookie,
        path: SESSION_COOKIE_OPTIONS.path,
        httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
        secure: SESSION_COOKIE_OPTIONS.secure,
        sameSite: SESSION_COOKIE_OPTIONS.sameSite,
        maxAge: SESSION_COOKIE_OPTIONS.maxAge,
      })

      return { ok: true }
    },
    { body: t.Object({ idToken: t.String() }) },
  )

  /**
   * POST /api/auth/logout
   * Clear the session cookie and revoke the GIP session.
   * Also fans out session.revoked webhooks to all apps the user has access to.
   */
  .post('/logout', async ({ request, cookie }) => {
    const cookieHeader = request.headers.get('cookie') ?? ''
    const sessionCookie = getSessionCookieValue(cookieHeader)

    if (sessionCookie) {
      try {
        const decoded = await verifySessionCookie(sessionCookie)
        // Resolve portal userId from GIP uid
        const user = await db.query.identityUsers.findFirst({
          where: eq(identityUsers.gipUid, decoded.uid),
          columns: { id: true },
        })
        if (user) {
          await revokePortalSession({ userId: user.id, reason: 'logout' })
        }
      } catch {
        // Already invalid or user not found — clear the cookie anyway
      }
    }

    cookie[SESSION_COOKIE_OPTIONS.name].set({
      value: '',
      maxAge: 0,
      path: '/',
    })

    return { ok: true }
  })

  .post(
    '/broker/handoff',
    async ({ request, body, set }) => {
      try {
        const authUser = await resolveSessionUser(request)
        const app = await findBrokerAppBySlug(body.appSlug)

        if (!app) {
          set.status = 404
          return { message: 'App not found' }
        }

        return createBrokerHandoff(app, authUser, body.redirectTo)
      } catch (error) {
        if (error instanceof BrokerAuthorizationError) {
          set.status = 403
          return { message: error.message }
        }
        if (error instanceof BrokerValidationError) {
          set.status = 401
          return { message: error.message }
        }
        throw error
      }
    },
    {
      body: t.Object({
        appSlug: t.String({ minLength: 1 }),
        redirectTo: t.Optional(t.String()),
      }),
    },
  )

  .get('/broker/launch/:appSlug', ({ set }) => {
    set.status = 405
    return {
      message: 'Use POST /api/auth/broker/launch/:appSlug instead.',
    }
  })

  .post(
    '/broker/launch/:appSlug',
    async ({ request, params, query, set, redirect }) => {
      try {
        const authUser = await resolveSessionUser(request)
        const app = await findBrokerAppBySlug(params.appSlug)

        if (!app) {
          set.status = 404
          return { message: 'App not found' }
        }

        const handoff = await createBrokerHandoff(app, authUser, query.redirectTo)
        return redirect(handoff.redirectUrl)
      } catch (error) {
        if (error instanceof BrokerAuthorizationError) {
          set.status = 403
          return { message: error.message }
        }
        if (error instanceof BrokerValidationError) {
          set.status = 401
          return { message: error.message }
        }
        throw error
      }
    },
    {
      query: t.Object({
        redirectTo: t.Optional(t.String()),
      }),
    },
  )

  .post(
    '/broker/exchange',
    async ({ body, set }) => {
      try {
        return (await exchangeBrokerHandoff(body)) satisfies PortalBrokerExchangePayload
      } catch (error) {
        if (error instanceof BrokerValidationError) {
          set.status = 400
          return { message: error.message }
        }
        throw error
      }
    },
    {
      body: t.Object({
        appSlug: t.String({ minLength: 1 }),
        code: t.Optional(t.String()),
        token: t.Optional(t.String()),
      }),
    },
  )

  /**
   * GET /api/auth/me
   * Return current authenticated user plus accessible apps.
   */
  .get('/me', async ({ request, set }) => {
    try {
      const user = await resolveSessionUser(request)
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        portalRole: user.portalRole,
        apps: user.apps,
      }
    } catch {
      set.status = 401
      return { message: 'Invalid session' }
    }
  })

  /**
   * POST /api/auth/broker/introspect
   * Machine-to-machine session introspection endpoint for relying-party apps.
   * Protected by the PORTAL_INTROSPECT_SECRET shared secret.
   *
   * Returns { active: false } if the session has been revoked, the user is
   * inactive, or the app no longer has access. Returns { active: true, user }
   * if the session is still valid.
   */
  .post(
    '/broker/introspect',
    async ({ body, set, request }) => {
      const { userId, sessionIssuedAt, appSlug } = body

      const auth = await authenticateIntrospectCaller(request, appSlug)
      if (!auth.ok) {
        set.status = 401
        return { message: 'Unauthorized' }
      }
      console.log(`[introspect] via:${auth.via} app:${appSlug}`)

      const issuedAt = new Date(sessionIssuedAt)

      // 1. Look up the user
      const user = await db.query.identityUsers.findFirst({
        where: eq(identityUsers.id, userId),
      })

      if (!user) {
        set.status = 404
        return { message: 'User not found' }
      }

      // 2. Check for a revocation record more recent than when the session was issued
      const revocation = await db.query.sessionRevocations.findFirst({
        where: and(
          eq(sessionRevocations.userId, userId),
          gte(sessionRevocations.notBefore, issuedAt),
        ),
        // Most recent first — we want the one that would cover the given issuedAt
        orderBy: (t, { desc }) => [desc(t.revokedAt)],
      })

      if (revocation) {
        return {
          active: false,
          revokedAt: revocation.revokedAt.toISOString(),
          reason: revocation.reason as RevocationReason,
        }
      }

      // 3. Check user account status
      if (user.status !== 'active') {
        return {
          active: false,
          reason: 'status_change' as RevocationReason,
        }
      }

      // 4. Verify the relying-party app is still in the user's accessible apps
      const appSlugs = await listAppSlugsForUser(userId)
      if (!appSlugs.includes(appSlug)) {
        return {
          active: false,
          reason: 'admin' as RevocationReason,
        }
      }

      // 5. Build and return the active session user
      // Resolve teamIds via team memberships (mirrors claims.ts resolution)
      const memberships = await db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(eq(teamMembers.userId, userId))
      const teamIds = memberships.map((m) => m.teamId)

      const sessionUser: PortalSessionUser = {
        id: user.id,
        gipUid: user.gipUid ?? '',
        email: user.email,
        name: user.name,
        portalRole: user.portalRole as PortalSessionUser['portalRole'],
        teamIds,
        apps: appSlugs,
      }

      return { active: true, user: sessionUser }
    },
    {
      body: t.Object({
        userId: t.String({ minLength: 1 }),
        sessionIssuedAt: t.String({ minLength: 1 }),
        appSlug: t.String({ minLength: 1 }),
      }),
    },
  )
