/**
 * /api/me/sessions — self-service active-sessions panel (Spec 06 PR E §10).
 *
 * Three endpoints, all gated by authPlugin (the caller must be authenticated):
 *
 *  - GET    /api/me/sessions                  — list active rows for the caller
 *  - DELETE /api/me/sessions/:id              — revoke one row (ownership-gated)
 *  - POST   /api/me/sessions/sign-out-others  — revoke every row except the current one
 *
 * Ownership semantics: a session id that does not belong to the caller (or has been
 * revoked, or is expired) returns 404 — uniform with "row does not exist" so a user
 * cannot probe whether someone else holds a given session id.
 */
import { Elysia, t } from 'elysia'
import { SESSION_COOKIE_OPTIONS } from '@coms-portal/shared'
import { authPlugin } from '../middleware/auth'
import {
  listActiveSessionsForUser,
  getOwnedSession,
  revokeSession,
  revokeAllSessionsForUser,
  truncateIpForDisplay,
} from '../services/sessions'

export const meSessionRoutes = new Elysia({ prefix: '/me/sessions' })
  .use(authPlugin)

  .get(
    '/',
    async ({ authUser, sessionId }) => {
      const rows = await listActiveSessionsForUser(authUser.id)
      return {
        sessions: rows.map((r) => ({
          id: r.id,
          authMethod: r.authMethod,
          deviceLabel: r.deviceLabel,
          ipAddress: truncateIpForDisplay(r.ipAddress),
          createdAt: r.createdAt.toISOString(),
          expiresAt: r.expiresAt.toISOString(),
          isCurrent: r.id === sessionId,
        })),
      }
    },
    {
      response: {
        200: t.Object({
          sessions: t.Array(
            t.Object({
              id: t.String(),
              authMethod: t.Union([
                t.Literal('workspace_oidc'),
                t.Literal('personal_otp'),
                t.Literal('admin_bypass'),
              ]),
              deviceLabel: t.Union([t.String(), t.Null()]),
              ipAddress: t.Union([t.String(), t.Null()]),
              createdAt: t.String(),
              expiresAt: t.String(),
              isCurrent: t.Boolean(),
            }),
          ),
        }),
      },
    },
  )

  .delete(
    '/:id',
    async ({ params, authUser, sessionId, cookie, set }) => {
      const owned = await getOwnedSession(authUser.id, params.id)
      if (!owned) {
        set.status = 404
        return { error: 'SESSION_NOT_FOUND' as const }
      }
      await revokeSession(owned.id, 'logout_other_device')

      // If the user just revoked their current session, clear the cookie so the next
      // request bounces them through the login flow cleanly.
      const isCurrent = owned.id === sessionId
      if (isCurrent) {
        cookie[SESSION_COOKIE_OPTIONS.name].set({
          value: '',
          maxAge: 0,
          path: '/',
          httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
          secure: SESSION_COOKIE_OPTIONS.secure,
          sameSite: SESSION_COOKIE_OPTIONS.sameSite,
        })
      }
      return { ok: true as const, clearedCookie: isCurrent }
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ ok: t.Literal(true), clearedCookie: t.Boolean() }),
        404: t.Object({ error: t.Literal('SESSION_NOT_FOUND') }),
      },
    },
  )

  .post(
    '/sign-out-others',
    async ({ authUser, sessionId }) => {
      await revokeAllSessionsForUser({
        userId: authUser.id,
        reason: 'logout_all_other',
        exceptSessionId: sessionId,
      })
      return { ok: true as const }
    },
    {
      response: {
        200: t.Object({ ok: t.Literal(true) }),
      },
    },
  )
