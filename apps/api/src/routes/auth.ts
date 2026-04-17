import { Elysia, t } from 'elysia'
import {
  verifyIdToken,
  createSessionCookie,
  verifySessionCookie,
  revokeRefreshTokens,
} from '../gip-admin'
import { db } from '~/db'
import { identityUsers } from '~/db/schema'
import { eq } from 'drizzle-orm'
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
   */
  .post('/logout', async ({ request, cookie }) => {
    const cookieHeader = request.headers.get('cookie') ?? ''
    const sessionCookie = getSessionCookieValue(cookieHeader)

    if (sessionCookie) {
      try {
        const decoded = await verifySessionCookie(sessionCookie)
        await revokeRefreshTokens(decoded.uid)
      } catch {
        // Already invalid — clear anyway
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

  .get(
    '/broker/launch/:appSlug',
    async ({ request, params, query, set }) => {
      try {
        const authUser = await resolveSessionUser(request)
        const app = await findBrokerAppBySlug(params.appSlug)

        if (!app) {
          set.status = 404
          return { message: 'App not found' }
        }

        const handoff = await createBrokerHandoff(app, authUser, query.redirectTo)
        return new Response(null, {
          status: 302,
          headers: {
            Location: handoff.redirectUrl,
          },
        })
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
