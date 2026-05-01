/**
 * GET /auth/one-time?token=… — consume a one-time login link (Spec 06 PR E §11).
 *
 * Public route (no authPlugin) — the opaque token IS the credential.  On success,
 * mints an `admin_bypass` session (1-hour TTL per Q-ttl), sets the `__session`
 * cookie, writes `one_time_link_consumed` to the audit log, and 303-redirects to
 * `/`.  On any failure mode (invalid / expired / already-used) → 403 with a uniform
 * INVALID_OR_EXPIRED envelope (no enumeration leak).
 *
 * Mounted at top-level (not under /api) per spec wording: the URL the admin shares
 * is `${PORTAL_ORIGIN}/auth/one-time?token=…`, matching how OIDC return URLs are
 * served.  The cookie is set with the same SESSION_COOKIE_OPTIONS as every other
 * portal-native session; consumers (web app) treat it identically to a workspace
 * OIDC session.
 */
import { Elysia, t } from 'elysia'
import { SESSION_COOKIE_OPTIONS } from '@coms-portal/shared'
import { consumeOneTimeLoginLink } from '~/services/one-time-login-links'
import { createPortalSession } from '~/services/sessions'
import { logAudit } from '~/services/audit'
import { logger } from '~/logger'

function extractRequestIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null
  return request.headers.get('x-real-ip') ?? null
}

export const oneTimeAuthRoutes = new Elysia({ prefix: '/auth' }).get(
  '/one-time',
  async ({ query, request, cookie, set }) => {
    const token = query.token
    if (!token || typeof token !== 'string' || token.length === 0) {
      set.status = 403
      return { error: 'INVALID_OR_EXPIRED' as const }
    }

    const requestIp = extractRequestIp(request)
    const result = await consumeOneTimeLoginLink({ token, requestIp })

    if (result.outcome !== 'consumed') {
      logger.warn(
        { outcome: result.outcome, requestIp },
        '[one-time-link] consume rejected',
      )
      set.status = 403
      return { error: 'INVALID_OR_EXPIRED' as const }
    }

    // Mint admin_bypass session (1h TTL per Q-ttl in services/sessions.ts).
    const { sessionId } = await createPortalSession({
      identityUserId: result.targetIdentityUserId,
      authMethod: 'admin_bypass',
      emailUsed: null,
      request,
    })

    await logAudit({
      actorId: result.issuedBy,
      action: 'one_time_link_consumed',
      targetType: 'user',
      targetId: result.targetIdentityUserId,
      details: { linkId: result.linkId, consumedFromIp: requestIp },
      actorIp: requestIp ?? undefined,
    })

    cookie[SESSION_COOKIE_OPTIONS.name].set({
      value: sessionId,
      path: SESSION_COOKIE_OPTIONS.path,
      httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
      secure: SESSION_COOKIE_OPTIONS.secure,
      sameSite: SESSION_COOKIE_OPTIONS.sameSite,
      // 1h max-age — matches admin_bypass TTL
      maxAge: 60 * 60,
    })

    set.status = 303
    set.headers['location'] = '/'
    return { ok: true as const }
  },
  {
    query: t.Object({ token: t.String({ minLength: 1, maxLength: 512 }) }),
  },
)
