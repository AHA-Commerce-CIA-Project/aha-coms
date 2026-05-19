import { Elysia, t } from 'elysia'
import { verifyIdToken } from '../gip-admin'
import { db } from '~/db'
import { identityUsers, identityUserEmails, sessionRevocations, teamMembers, appRegistry } from '~/db/schema'
import { eq, and, gte, ne } from 'drizzle-orm'
import {
  type PortalBrokerExchangePayload,
  type PortalSessionUser,
  SESSION_COOKIE_OPTIONS,
} from '@coms-portal/shared'
import { PORTAL_ORIGIN } from '~/config'
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
import {
  createPortalSession,
  validateSession,
  revokeSession,
} from '../services/sessions'
import { getDisplayEmail } from '../services/email-resolution'
import { requestOtp, verifyOtp } from '../services/otp'
import { attemptPasswordSignIn } from '../services/password-signin'
import { logAudit } from '../services/audit'
import { generatePasswordResetLink } from '../gip-admin'

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

  const portalOrigin = PORTAL_ORIGIN
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

/**
 * Resolve the session user for broker/handoff and broker/launch endpoints.
 * Uses portal-native session validation + full AuthUser resolution.
 * Throws BrokerValidationError if not authenticated.
 */
async function resolveSessionUser(request: Request): Promise<PortalSessionUser> {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const sessionCookie = getSessionCookieValue(cookieHeader)

  if (!sessionCookie) {
    throw new BrokerValidationError('Not authenticated')
  }

  const sessionUser = await validateSession(sessionCookie)
  if (!sessionUser) {
    throw new BrokerValidationError('Not authenticated')
  }

  const authUser = await resolveAuthUser(sessionUser)
  // PortalSessionUser.portalRole is 'employee' | 'admin' from coms-shared.
  // super_admin is an internal portal concept; cast it to 'admin' for the
  // broker layer that forwards the role to H-apps.
  return {
    ...authUser,
    portalRole: (authUser.portalRole === 'super_admin' ? 'admin' : authUser.portalRole) as PortalSessionUser['portalRole'],
  }
}

export const authRoutes = new Elysia({ prefix: '/auth' })
  /**
   * POST /api/auth/session
   * Exchange a Firebase ID token for a portal-native session cookie.
   *
   * Workspace OIDC path (Q1-session):
   *  1. Verify the Google ID token via GIP's OIDC verifier.
   *  2. Lookup the email in identity_user_emails (Q-mismatch: kind-agnostic lookup).
   *  3. If kind='personal' → 403 WRONG_LOGIN_PATH with structured error.
   *  4. Look up and validate the identity_users row; verify status.
   *  5. Auto-link gipUid on first login (if null).
   *  6. Auto-verify email on first successful login (Q4c).
   *  7. Mint a portal-native auth_sessions row; set opaque UUID as cookie.
   */
  .post(
    '/session',
    async ({ body, set, cookie, request }) => {
      let decoded
      try {
        decoded = await verifyIdToken(body.idToken)
      } catch (e) {
        logger.error({ err: e }, 'verifyIdToken failed')
        set.status = 401
        return { message: e instanceof Error ? e.message : 'Invalid token' }
      }

      if (!decoded.email) {
        set.status = 401
        return { message: 'No email claim' }
      }
      const emailNormalized = decoded.email.toLowerCase().trim()

      // Q-mismatch: lookup by email_normalized only — no kind filter at this stage.
      const emailRows = await db
        .select()
        .from(identityUserEmails)
        .where(eq(identityUserEmails.emailNormalized, emailNormalized))
        .limit(1)

      if (emailRows.length === 0) {
        set.status = 403
        return { message: 'Access denied. Contact your administrator.' }
      }

      const emailRow = emailRows[0]!

      if (emailRow.kind === 'personal') {
        // Q-mismatch: workspace OIDC against personal-kind email — strict-but-helpful 403
        set.status = 403
        return {
          error: 'WRONG_LOGIN_PATH' as const,
          message: 'This email is registered for code-based sign-in only. Use the email & verification code option.',
        }
      }

      // Look up identity_users; verify status
      const user = await db.query.identityUsers.findFirst({
        where: eq(identityUsers.id, emailRow.identityUserId),
      })

      if (!user) {
        set.status = 403
        return { message: 'Access denied. Contact your administrator.' }
      }

      if (user.status !== 'active') {
        set.status = 403
        return { message: 'Account is inactive or suspended.' }
      }

      // Link gipUid on first login if not stored yet
      if (!user.gipUid && decoded.uid) {
        await db
          .update(identityUsers)
          .set({ gipUid: decoded.uid, updatedAt: new Date() })
          .where(eq(identityUsers.id, user.id))
      }

      // Auto-verify on first successful login (Q4c)
      if (emailRow.verifiedAt === null) {
        await db
          .update(identityUserEmails)
          .set({ verifiedAt: new Date(), updatedAt: new Date() })
          .where(eq(identityUserEmails.id, emailRow.id))
      }

      // Mint portal-native session
      const { sessionId } = await createPortalSession({
        identityUserId: user.id,
        authMethod: 'workspace_oidc',
        emailUsed: decoded.email,
        request,
      })

      // Set cookie with sessionId as the opaque value
      cookie[SESSION_COOKIE_OPTIONS.name].set({
        value: sessionId,
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
        403: t.Union([
          t.Object({ error: t.Literal('WRONG_LOGIN_PATH'), message: t.String() }),
          t.Object({ message: t.String() }),
        ]),
      },
    },
  )

  /**
   * POST /api/auth/logout
   * Clear the session cookie and revoke the current session.
   *
   * Q-logout action A: per-row revokedAt UPDATE for the current session only.
   * Also calls revokePortalSession (session-revocation.ts) which:
   *   - inserts a session_revocations cutoff row (broad guard)
   *   - calls GIP revokeRefreshTokens (best-effort)
   *   - fans out session.revoked webhooks to all the user's apps
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
          const sessionUser = await validateSession(sessionCookie)
          if (sessionUser) {
            // Action A: revoke this specific session row
            await revokeSession(sessionUser.sessionId, 'logout')
            // Fanout: webhook emission + GIP refresh-token revoke + cutoff row
            await revokePortalSession({ userId: sessionUser.id, reason: 'logout' })
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
   * Clears the portal session cookie, revokes the current session,
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
          const sessionUser = await validateSession(sessionCookie)
          if (sessionUser) {
            // Action A: revoke this specific session row
            await revokeSession(sessionUser.sessionId, 'logout')
            // Fanout: webhook emission + GIP refresh-token revoke + cutoff row
            await revokePortalSession({ userId: sessionUser.id, reason: 'logout' })
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
        // We need the underlying portalRole *before* collapse to compute capabilities,
        // so we resolve the auth user directly here rather than going through
        // resolveSessionUser (which collapses super_admin → admin for broker forwarding).
        const cookieHeader = request.headers.get('cookie') ?? ''
        const sessionCookie = getSessionCookieValue(cookieHeader)
        if (!sessionCookie) {
          set.status = 401
          return { message: 'Invalid session' }
        }
        const sessionUser = await validateSession(sessionCookie)
        if (!sessionUser) {
          set.status = 401
          return { message: 'Invalid session' }
        }
        const authUser = await resolveAuthUser(sessionUser)
        const isSuperAdmin = authUser.portalRole === 'super_admin'
        const collapsedRole = (isSuperAdmin ? 'admin' : authUser.portalRole) as PortalSessionUser['portalRole']
        return {
          id: authUser.id,
          email: authUser.email,
          name: authUser.name,
          portalRole: collapsedRole,
          apps: authUser.apps,
          // Spec 06 PR E §11: super_admin is a portal-internal capability.  The flag
          // is the only signal the web client gets — `portalRole` stays collapsed so
          // existing consumers of /api/auth/me are unaffected.
          capabilities: { canIssueOneTimeLoginLinks: isSuperAdmin },
          // Spec 06 PR F §1: gates the portal-web `(authed)` layout. When
          // `true`, every route except /onboarding/set-password redirects
          // there until the user POSTs to /api/auth/password/set.
          passwordSetupRequired: sessionUser.passwordSetupRequired,
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
          capabilities: t.Object({ canIssueOneTimeLoginLinks: t.Boolean() }),
          passwordSetupRequired: t.Boolean(),
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
      // Resolve teamIds via team memberships and display email
      const memberships = await db
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(eq(teamMembers.userId, userId))
      const teamIds = memberships.map((m) => m.teamId)

      // Resolve display email per Q8a (workspace > primary personal > first personal)
      const displayEmail = await getDisplayEmail(userId)

      const sessionUser: PortalSessionUser = {
        id: user.id,
        gipUid: user.gipUid ?? '',
        email: displayEmail ?? '',
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

  /**
   * POST /api/auth/otp/request
   * Request an OTP code for personal-email sign-in.
   *
   * Spec 06 §§433-476 — enumeration resistance (Q7g): identical 200 response
   * shape for both 'sent' and 'unknown_email' outcomes.
   * Returns 200 with structured error for 'wrong_login_path' (frontend renders
   * "Switch to Google sign-in" CTA).
   * Returns 429 with Retry-After for email-level cooldown, plain 429 for IP cap.
   */
  .post(
    '/otp/request',
    async ({ body, request, set }) => {
      const requestIp =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? request.headers.get('x-real-ip')
        ?? 'unknown'
      const result = await requestOtp({
        email: body.email,
        requestIp,
        forceOtp: body.force_otp === true,
      })
      switch (result.outcome) {
        case 'sent':
        case 'unknown_email':
          // Q7g enumeration resistance: same shape for both.
          return { message: "If this email is registered, you'll receive a code shortly. The code is valid for 10 minutes." }
        case 'wrong_login_path':
          // 200 with structured error — frontend uses the error code to render
          // both a "Sign in with Google" CTA and (post Spec 06 PR F) a "Use
          // email + password instead" CTA, since workspace identities can also
          // sign in with a password once one is set.
          return { error: 'WRONG_LOGIN_PATH' as const, message: 'This email uses Google sign-in or password. Use the "Sign in with Google" button below, or go back and pick "Sign in with email + password".' }
        case 'password_only':
          // Spec 06 PR F: admin-created credential bag — OTP is disabled.
          return { error: 'PASSWORD_ONLY' as const, message: 'This account uses a password only. Please enter it on the next step.' }
        case 'has_password':
          // Spec 06 PR F: password is set; route the user to the password step,
          // or pass force_otp=true to receive a one-time code anyway.
          return { error: 'HAS_PASSWORD' as const, message: 'This account uses a password. Please enter it on the next step, or click "Use code instead" to receive a one-time code.' }
        case 'rate_limited_email':
          set.status = 429
          set.headers['retry-after'] = '60'
          return { error: 'RATE_LIMITED' as const, message: 'Please wait a moment before requesting another code.' }
        case 'rate_limited_ip':
          set.status = 429
          return { error: 'RATE_LIMITED' as const, message: 'Too many requests. Please try again later.' }
      }
    },
    {
      body: t.Object({
        email: t.String({ format: 'email', maxLength: 255 }),
        force_otp: t.Optional(t.Boolean()),
      }),
    },
  )

  /**
   * POST /api/auth/otp/verify
   * Verify an OTP code and mint a portal session.
   *
   * Spec 06 §§446-476 — on success, sets the portal session cookie (same
   * cookie name + options used by the workspace OIDC path).
   */
  .post(
    '/otp/verify',
    async ({ body, request, set, cookie }) => {
      const result = await verifyOtp({ email: body.email, code: body.code })
      switch (result.outcome) {
        case 'invalid_or_expired':
          set.status = 400
          return result.attemptsRemaining !== undefined
            ? { error: 'INVALID_OR_EXPIRED' as const, attemptsRemaining: result.attemptsRemaining }
            : { error: 'INVALID_OR_EXPIRED' as const }
        case 'inactive_user':
          set.status = 403
          return { error: 'INACTIVE_USER' as const, message: 'This account is no longer active.' }
        case 'verified': {
          // Mint portal-native session
          const { sessionId, expiresAt } = await createPortalSession({
            identityUserId: result.identityUserId,
            authMethod: 'personal_otp',
            emailUsed: result.emailNormalized,
            request,
          })
          // Set cookie — same name + options as the workspace OIDC path above
          cookie[SESSION_COOKIE_OPTIONS.name].set({
            value: sessionId,
            path: SESSION_COOKIE_OPTIONS.path,
            httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
            secure: SESSION_COOKIE_OPTIONS.secure,
            sameSite: SESSION_COOKIE_OPTIONS.sameSite,
            maxAge: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
          })
          return { ok: true as const }
        }
      }
    },
    {
      body: t.Object({
        email: t.String({ format: 'email', maxLength: 255 }),
        code: t.String({ minLength: 6, maxLength: 6, pattern: '^\\d{6}$' }),
      }),
    },
  )

  /**
   * POST /api/auth/password/sign-in
   * Sign in with email + password — Spec 06 PR F §3 + §4.
   *
   * Outcomes / status codes:
   *   200 — { ok: true }, session cookie set
   *   401 — { error: 'INVALID_CREDENTIALS' }
   *   403 — { error: 'INACTIVE_USER' }
   *   423 — { error: 'LOCKED_OUT' } with Retry-After
   *   429 — { error: 'RATE_LIMITED' } with Retry-After (per-email) or plain (per-IP)
   */
  .post(
    '/password/sign-in',
    async ({ body, request, set, cookie }) => {
      const requestIp =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? request.headers.get('x-real-ip')
        ?? 'unknown'

      const result = await attemptPasswordSignIn({
        email: body.email,
        password: body.password,
        requestIp,
      })

      switch (result.outcome) {
        case 'invalid_credentials':
          set.status = 401
          return { error: 'INVALID_CREDENTIALS' as const, message: 'Invalid email or password.' }
        case 'inactive_user':
          set.status = 403
          return { error: 'INACTIVE_USER' as const, message: 'This account is no longer active.' }
        case 'rate_limited_email':
          set.status = 429
          set.headers['retry-after'] = String(result.retryAfterSeconds)
          return { error: 'RATE_LIMITED' as const, message: 'Too many attempts. Please wait a moment before trying again.' }
        case 'rate_limited_ip':
          set.status = 429
          return { error: 'RATE_LIMITED' as const, message: 'Too many requests. Please try again later.' }
        case 'locked_out':
          set.status = 423
          set.headers['retry-after'] = String(result.retryAfterSeconds)
          // Best-effort audit hook: the lockout event was triggered earlier;
          // record the user-facing block here so the audit row has the actor.
          try {
            await logAudit({
              actorId: '00000000-0000-0000-0000-000000000000',
              action: 'password_signin_lockout',
              targetType: 'user',
              targetId: '00000000-0000-0000-0000-000000000000',
              details: { email: body.email, retryAfterSeconds: result.retryAfterSeconds },
              actorIp: requestIp,
            })
          } catch {
            // Audit failure must not surface to the client.
          }
          return { error: 'LOCKED_OUT' as const, message: 'Too many failed attempts. Please try again later.' }
        case 'signed_in': {
          const { sessionId, expiresAt } = await createPortalSession({
            identityUserId: result.identityUserId,
            authMethod: 'password',
            emailUsed: result.emailNormalized,
            request,
          })
          cookie[SESSION_COOKIE_OPTIONS.name].set({
            value: sessionId,
            path: SESSION_COOKIE_OPTIONS.path,
            httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
            secure: SESSION_COOKIE_OPTIONS.secure,
            sameSite: SESSION_COOKIE_OPTIONS.sameSite,
            maxAge: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
          })
          return { ok: true as const }
        }
      }
    },
    {
      body: t.Object({
        email: t.String({ format: 'email', maxLength: 255 }),
        password: t.String({ minLength: 1, maxLength: 256 }),
      }),
    },
  )

  /**
   * POST /api/auth/password/forgot
   *
   * Issue a GIP-side password-reset email. Enumeration-resistant: always
   * returns 200, regardless of whether the email exists or is password-only
   * (admin-created credential bags refuse reset on the GIP side — admin must
   * rotate via the planned admin-side action in a future PR).
   */
  .post(
    '/password/forgot',
    async ({ body }) => {
      // Pre-check: if the email maps to a password_only_auth identity, skip
      // sending entirely. The response shape is still 200 with the generic
      // message so callers can't distinguish.
      const emailNormalized = body.email.toLowerCase().trim()
      try {
        const emailRow = await db.query.identityUserEmails.findFirst({
          where: eq(identityUserEmails.emailNormalized, emailNormalized),
          columns: { identityUserId: true },
        })
        const owner = emailRow
          ? await db.query.identityUsers.findFirst({
              where: eq(identityUsers.id, emailRow.identityUserId),
              columns: { passwordOnlyAuth: true },
            })
          : null
        if (emailRow && owner && owner.passwordOnlyAuth !== true) {
          await generatePasswordResetLink(body.email)
        }
      } catch (e) {
        logger.warn({ err: e }, '[password/forgot] reset link issuance failed')
      }
      return { message: "If this email is registered, you'll receive a password-reset link shortly." }
    },
    {
      body: t.Object({
        email: t.String({ format: 'email', maxLength: 255 }),
      }),
    },
  )

