/**
 * POST /api/auth/password/set — Spec 06 PR F.
 *
 * Two modes:
 *   - first-set:       session is flagged `passwordSetupRequired`. `currentPassword`
 *                      is NOT required.
 *   - change-password: any authenticated session. `currentPassword` IS required and
 *                      is verified against GIP via signInWithPassword.
 *
 * In both modes the new password is validated against the policy
 * (`validateMinimum`), the GIP password is updated, and
 * `identity_users.password_set_at` is set to `now()`.
 *
 * Lives in its own file so test files that mock `~/middleware/auth` with a
 * shallow `authPlugin` stub aren't forced to load this surface when they
 * import `authRoutes`.
 */

import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '~/db'
import { identityUsers } from '~/db/schema'
import { authPlugin } from '../../middleware/auth'
import { requestIdPlugin } from '../../middleware/request-id'
import { getDisplayEmail } from '../../services/email-resolution'
import { logAudit } from '../../services/audit'
import { validateMinimum } from '../../services/password-policy'
import {
  signInWithPassword,
  GipSignInError,
  updateGipUserPassword,
} from '../../gip-admin'

export const passwordSetRoutes = new Elysia({ prefix: '/auth/password' })
  .use(requestIdPlugin)
  .use(authPlugin)
  .post(
    '/set',
    async ({ body, authUser, passwordSetupRequired, requestId, actorIp, set }) => {
      // 1) Policy gate
      const policy = validateMinimum(body.newPassword)
      if (!policy.ok) {
        set.status = 400
        return { error: 'WEAK_PASSWORD' as const, message: policy.reason }
      }

      // 2) Load the identity row to find gipUid + the password_set_at flag
      const identity = await db.query.identityUsers.findFirst({
        where: eq(identityUsers.id, authUser.id),
        columns: { id: true, gipUid: true, passwordSetAt: true },
      })
      if (!identity || !identity.gipUid) {
        set.status = 400
        return { error: 'NO_GIP_USER' as const, message: 'This account has no linked GIP user.' }
      }

      // 3) Resolve display email — required for change-password's GIP verify call.
      const displayEmail = await getDisplayEmail(authUser.id)
      if (!displayEmail) {
        set.status = 400
        return { error: 'NO_EMAIL' as const, message: 'This account has no email on file.' }
      }

      const isFirstSet = identity.passwordSetAt === null
      if (isFirstSet) {
        // Spec 06 PR F §1: first-set requires the session-level flag. Without
        // it a stale first-set call would silently bypass the current-password
        // check.
        if (!passwordSetupRequired) {
          set.status = 403
          return { error: 'CURRENT_PASSWORD_REQUIRED' as const, message: 'Current password is required.' }
        }
      } else {
        if (!body.currentPassword) {
          set.status = 400
          return { error: 'CURRENT_PASSWORD_REQUIRED' as const, message: 'Current password is required.' }
        }
        try {
          await signInWithPassword(displayEmail, body.currentPassword)
        } catch (err) {
          if (err instanceof GipSignInError && err.detail.code !== 'UNKNOWN') {
            set.status = 401
            return { error: 'CURRENT_PASSWORD_INVALID' as const, message: 'Current password is incorrect.' }
          }
          throw err
        }
      }

      // 4) Apply the new password via GIP
      await updateGipUserPassword(identity.gipUid, body.newPassword)

      // 5) Update local password_set_at + clear any pending lockout
      const now = new Date()
      await db
        .update(identityUsers)
        .set({ passwordSetAt: now, passwordLockoutUntil: null, updatedAt: now })
        .where(eq(identityUsers.id, identity.id))

      // 6) Audit (no password value)
      await logAudit({
        actorId: authUser.id,
        action: 'password_set',
        targetType: 'user',
        targetId: identity.id,
        details: { mode: isFirstSet ? 'first_set' : 'change_password', email: displayEmail },
        requestId,
        actorIp,
      })

      return { ok: true as const }
    },
    {
      body: t.Object({
        currentPassword: t.Optional(t.String({ minLength: 1, maxLength: 256 })),
        newPassword: t.String({ minLength: 1, maxLength: 256 }),
      }),
      response: {
        200: t.Object({ ok: t.Literal(true) }),
        400: t.Union([
          t.Object({ error: t.Literal('WEAK_PASSWORD'), message: t.String() }),
          t.Object({ error: t.Literal('NO_GIP_USER'), message: t.String() }),
          t.Object({ error: t.Literal('NO_EMAIL'), message: t.String() }),
          t.Object({ error: t.Literal('CURRENT_PASSWORD_REQUIRED'), message: t.String() }),
        ]),
        401: t.Object({ error: t.Literal('CURRENT_PASSWORD_INVALID'), message: t.String() }),
        403: t.Object({ error: t.Literal('CURRENT_PASSWORD_REQUIRED'), message: t.String() }),
      },
    },
  )
