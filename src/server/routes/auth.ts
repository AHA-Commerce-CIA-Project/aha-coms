import { Elysia, t } from 'elysia'
import { getAuth } from 'firebase-admin/auth'
import { db } from '~/db'
import { identityUsers } from '~/db/schema'
import { eq } from 'drizzle-orm'
import { initGip } from '../gip'
import { SESSION_COOKIE_OPTIONS } from '~/shared/constants/roles'
import { resolveAndSyncClaims } from '../services/claims'

initGip()

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
        decoded = await getAuth().verifyIdToken(body.idToken)
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
      const sessionCookie = await getAuth().createSessionCookie(body.idToken, { expiresIn })

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
    const match = cookieHeader.match(/__session=([^;]+)/)
    const sessionCookie = match?.[1]

    if (sessionCookie) {
      try {
        const decoded = await getAuth().verifySessionCookie(sessionCookie)
        await getAuth().revokeRefreshTokens(decoded.uid)
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

  /**
   * GET /api/auth/me
   * Return current authenticated user plus accessible apps.
   */
  .get('/me', async ({ request, set }) => {
    const cookieHeader = request.headers.get('cookie') ?? ''
    const match = cookieHeader.match(/__session=([^;]+)/)
    const sessionCookie = match?.[1]

    if (!sessionCookie) {
      set.status = 401
      return { message: 'Not authenticated' }
    }

    try {
      const decoded = await getAuth().verifySessionCookie(sessionCookie, true)

      const user = await db.query.identityUsers.findFirst({
        where: eq(identityUsers.gipUid, decoded.uid),
      })

      if (!user) {
        set.status = 401
        return { message: 'User not found' }
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        portalRole: user.portalRole,
        apps: (decoded['apps'] as string[]) ?? [],
      }
    } catch {
      set.status = 401
      return { message: 'Invalid session' }
    }
  })
