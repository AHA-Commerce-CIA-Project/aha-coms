import { Elysia, t } from 'elysia'
import {
  verifyIdToken,
  createSessionCookie,
  verifySessionCookie,
} from '../gip-admin'
import { db } from '~/db'
import { identityUsers, sessionRevocations, teamMembers, appRegistry } from '~/db/schema'
import { eq, and, gte, ne } from 'drizzle-orm'
import {
  type PortalBrokerExchangePayload,
  type PortalSessionUser,
  SESSION_COOKIE_OPTIONS,
} from '@coms-portal/shared'
import { PORTAL_ORIGIN } from '~/config'
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
import { logger } from '~/logger'

const SELF_AUDIENCE = PORTAL_ORIGIN

type IntrospectAuthFailure =
  | 'app_not_found'
  | 'sa_not_configured'
  | 'missing_bearer'
  | 'verify_failed'

/**
 * OIDC-only authenticator for the broker/introspect endpoint.
 *
 * Requires `Authorization: Bearer <google-id-token>` and the calling app's
 * `serviceAccountEmail` to be configured in `app_registry`. Verifies the
 * token's signature, audience, and email claim against the configured SA.
 *
 * The caller is responsible for 401 handling. The failure reason is returned
 * separately for structured logging only — it is never exposed to the client.
 */
async function authenticateIntrospectCaller(
  request: Request,
  appSlug: string,
): Promise<
  | { ok: true }
  | { ok: false; reason: IntrospectAuthFailure }
> {
  const app = await db.query.appRegistry.findFirst({
    where: eq(appRegistry.slug, appSlug),
    columns: { serviceAccountEmail: true },
  })

  if (!app) return { ok: false, reason: 'app_not_found' }
  if (!app.serviceAccountEmail) {
    return { ok: false, reason: 'sa_not_configured' }
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, reason: 'missing_bearer' }
  }

  try {
    await verifyGoogleIdToken({
      idToken: authHeader.slice(7),
      expectedAudience: SELF_AUDIENCE,
      expectedSAEmail: app.serviceAccountEmail,
    })
    return { ok: true }
  } catch {
    return { ok: false, reason: 'verify_failed' }
  }
}

/**
 * Validate `post_logout_redirect_uri` against the active app_registry.url
 * allowlist. Comparison is by `URL.origin`, which lets H-apps pass branded
 * post-logout paths (e.g. `https://heroes.ahacommerce.net/logged-out`) under
 * any registered origin — see spec-01 line 91 and the Heroes integration
 * handoff. Returns the canonical candidate URL on success, null on failure.
 *
 * Allowlist source: `app_registry.url` for non-deprecated apps. The portal's
 * own origin (`PORTAL_PUBLIC_ORIGIN`) is always implicitly allowed so that
 * portal → portal logout returns the user to the landing page.
 */
async function validatePostLogoutRedirectUri(uri: string): Promise<string | null> {
  let candidate: URL
  try {
    candidate = new URL(uri)
  } catch {
    return null
  }
  if (candidate.protocol !== 'https:' && candidate.protocol !== 'http:') {
    return null
  }

  const portalOrigin = process.env.PORTAL_PUBLIC_ORIGIN ?? SELF_AUDIENCE
  try {
    if (new URL(portalOrigin).origin === candidate.origin) {
      return candidate.toString()
    }
  } catch {
    // Misconfigured PORTAL_PUBLIC_ORIGIN — fall through to registry check.
  }

  const apps = await db
    .select({ url: appRegistry.url })
    .from(appRegistry)
    .where(ne(appRegistry.status, 'deprecated'))
  for (const a of apps) {
    try {
      if (new URL(a.url).origin === candidate.origin) {
        return candidate.toString()
      }
    } catch {
      // Skip malformed registry rows so one bad record doesn't break logout.
    }
  }
  return null
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
        logger.error({ err: e }, 'verifyIdToken failed')
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
    {
      body: t.Object({ idToken: t.String() }),
      response: {
        200: t.Object({ ok: t.Literal(true) }),
        401: t.Object({ message: t.String() }),
        403: t.Object({ message: t.String() }),
      },
    },
  )

  /**
   * POST /api/auth/logout
   * Clear the session cookie and revoke the GIP session.
   * Fans out session.revoked webhooks to all apps the user has access to.
   *
   * Optional `post_logout_redirect_uri` body field (OIDC RP-initiated logout
   * adjunct): when present and allowlisted against `app_registry.url`, the
   * response includes a `redirect_to` field so the same-origin client can
   * navigate after sign-out. When present and NOT allowlisted, returns 400
   * (never silently fall through — open-redirect vector).
   */
  .post(
    '/logout',
    async ({ request, body, cookie, set }) => {
      const postLogoutRedirectUri = body?.post_logout_redirect_uri

      let validatedRedirect: string | null = null
      if (postLogoutRedirectUri) {
        validatedRedirect = await validatePostLogoutRedirectUri(postLogoutRedirectUri)
        if (!validatedRedirect) {
          logger.warn({ postLogoutRedirectUri }, '[logout] rejected post_logout_redirect_uri (not in allowlist)')
          set.status = 400
          return { message: 'post_logout_redirect_uri not allowlisted' }
        }
      }

      const cookieHeader = request.headers.get('cookie') ?? ''
      const sessionCookie = getSessionCookieValue(cookieHeader)

      if (sessionCookie) {
        try {
          const decoded = await verifySessionCookie(sessionCookie)
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

      if (validatedRedirect) {
        return { ok: true, redirect_to: validatedRedirect }
      }
      return { ok: true }
    },
    {
      body: t.Optional(
        t.Object({
          post_logout_redirect_uri: t.Optional(t.String()),
        }),
      ),
      response: {
        200: t.Union([
          t.Object({ ok: t.Literal(true) }),
          t.Object({ ok: t.Literal(true), redirect_to: t.String() }),
        ]),
        400: t.Object({ message: t.String() }),
      },
    },
  )

  /**
   * GET /api/auth/logout
   *
   * OIDC RP-initiated logout entry point. Top-level browser navigation from a
   * relying-party app (e.g. Heroes' account widget) carrying:
   *   - `id_token_hint` (optional today; reserved for future cross-IdP exits)
   *   - `post_logout_redirect_uri` (required for the redirect; must be allowlisted)
   *
   * Clears the portal session cookie, revokes the GIP session (same as POST),
   * then 303-redirects to the validated URI. If the URI is missing or not
   * allowlisted, returns 400.
   */
  .get(
    '/logout',
    async ({ request, query, cookie, set }) => {
      const postLogoutRedirectUri = query.post_logout_redirect_uri

      if (!postLogoutRedirectUri) {
        set.status = 400
        return { message: 'post_logout_redirect_uri is required for RP-initiated logout' }
      }

      const validatedRedirect = await validatePostLogoutRedirectUri(postLogoutRedirectUri)
      if (!validatedRedirect) {
        logger.warn({ postLogoutRedirectUri }, '[logout-rp] rejected post_logout_redirect_uri (not in allowlist)')
        set.status = 400
        return { message: 'post_logout_redirect_uri not allowlisted' }
      }

      const cookieHeader = request.headers.get('cookie') ?? ''
      const sessionCookie = getSessionCookieValue(cookieHeader)

      if (sessionCookie) {
        try {
          const decoded = await verifySessionCookie(sessionCookie)
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

      set.status = 303
      set.headers.location = validatedRedirect
      return ''
    },
    {
      query: t.Object({
        post_logout_redirect_uri: t.String(),
        id_token_hint: t.Optional(t.String()),
      }),
      response: {
        303: t.String(),
        400: t.Object({ message: t.String() }),
      },
    },
  )

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
      response: {
        200: t.Any(),
        401: t.Object({ message: t.String() }),
        403: t.Object({ message: t.String() }),
        404: t.Object({ message: t.String() }),
      },
    },
  )

  .get('/broker/launch/:appSlug', ({ set }) => {
    set.status = 405
    return {
      message: 'Use POST /api/auth/broker/launch/:appSlug instead.',
    }
  }, { response: { 405: t.Object({ message: t.String() }) } })

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
      response: {
        302: t.String(),
        401: t.Object({ message: t.String() }),
        403: t.Object({ message: t.String() }),
        404: t.Object({ message: t.String() }),
      },
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
      response: {
        200: t.Any(),
        400: t.Object({ message: t.String() }),
      },
    },
  )

  /**
   * GET /api/auth/me
   * Return current authenticated user plus accessible apps.
   */
  .get(
    '/me',
    async ({ request, set }) => {
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
    },
    {
      response: {
        200: t.Object({
          id: t.String(),
          email: t.String(),
          name: t.String(),
          portalRole: t.String(),
          apps: t.Array(t.String()),
        }),
        401: t.Object({ message: t.String() }),
      },
    },
  )

  /**
   * POST /api/auth/broker/introspect
   * Machine-to-machine session introspection endpoint for relying-party apps.
   * Protected by Google OIDC ID-token verification — caller must present a
   * Bearer token whose `email` claim matches the app's configured
   * `service_account_email`.
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
        // Reason is logged but never returned to the client to avoid leaking
        // whether the app exists / is OIDC-configured.
        logger.warn({ appSlug, reason: auth.reason }, '[introspect] auth_failed')
        set.status = 401
        return { message: 'Unauthorized' }
      }
      logger.info({ appSlug }, '[introspect] via:oidc')

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
      response: {
        200: t.Union([
          t.Object({
            active: t.Literal(true),
            user: t.Any(),
          }),
          t.Object({
            active: t.Literal(false),
            revokedAt: t.String(),
            reason: t.String(),
          }),
          t.Object({
            active: t.Literal(false),
            reason: t.String(),
          }),
        ]),
        401: t.Object({ message: t.String() }),
        404: t.Object({ message: t.String() }),
      },
    },
  )
