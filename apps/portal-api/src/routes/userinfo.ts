import { Elysia, t } from 'elysia'
import { getSessionCookieValue } from '../middleware/session-cookie'
import { resolveAuthUser } from '../middleware/auth'
import { validateSession } from '../services/sessions'
import { getEmailEntriesWithIds } from '../services/email-resolution'
import { getLauncherAppsForUser } from '../services/launcher'

/**
 * GET /api/userinfo
 *
 * Account-widget data source. Returns the authenticated user's identity plus
 * the launcher list of apps they can reach. Authentication is the portal
 * session cookie; same auth path as `/api/auth/me`.
 *
 * Response shape (spec-06 Q8b):
 *   {
 *     sub: string,                 // identity_users.id
 *     name: string,                // display name
 *     email: string,               // primary email per Q8a (workspace > primary personal > first personal)
 *     emails: UserEmailEntry[],    // full list per Q8b — {address, kind, isPrimary, verified, addedBy}
 *     portalRole: string,
 *     apps: [{ slug, label, url }]
 *   }
 *
 * The scalar `email` claim is unchanged behaviourally (already what `getDisplayEmail`
 * returns), so OIDC token consumers see no change. The `emails` array is additive.
 */
export const userinfoRoutes = new Elysia()
  .get(
    '/userinfo',
    async ({ request, set }) => {
      const cookieHeader = request.headers.get('cookie') ?? ''
      const sessionCookie = getSessionCookieValue(cookieHeader)
      if (!sessionCookie) {
        set.status = 401
        return { message: 'No session cookie' }
      }

      const sessionUser = await validateSession(sessionCookie)
      if (!sessionUser) {
        set.status = 401
        return { message: 'Invalid or expired session' }
      }

      let authUser
      try {
        authUser = await resolveAuthUser(sessionUser)
      } catch {
        set.status = 401
        return { message: 'User not resolvable' }
      }

      // Launcher list is built by the launcher service so portal-web's
      // (authed) layout can call the same code in-process. See
      // apps/portal-api/src/services/launcher.ts.
      const launcherApps = await getLauncherAppsForUser(authUser)

      // Q8b: full email entries array, with row ids so the profile UI can
      // address rows directly via PATCH/DELETE without a second round-trip.
      // The id is NOT included in webhook payloads (different surface).
      const emails = await getEmailEntriesWithIds(authUser.id)

      // identity_users has no avatar_url column today. Field is in the contract
      // for forward-compat with spec-04 (user preferences) which may add one.
      return {
        sub: authUser.id,
        name: authUser.name,
        email: authUser.email,
        emails,
        portalRole: authUser.portalRole,
        avatar_url: null as string | null,
        apps: launcherApps,
      }
    },
    {
      response: {
        200: t.Object({
          sub: t.String(),
          name: t.String(),
          email: t.String(),
          emails: t.Array(
            t.Object({
              emailId: t.String(),
              address: t.String(),
              kind: t.Union([t.Literal('workspace'), t.Literal('personal')]),
              isPrimary: t.Boolean(),
              verified: t.Boolean(),
              addedBy: t.String(),
            }),
          ),
          portalRole: t.String(),
          avatar_url: t.Union([t.String(), t.Null()]),
          apps: t.Array(
            t.Object({
              slug: t.String(),
              label: t.String(),
              url: t.String(),
            }),
          ),
        }),
        401: t.Object({ message: t.String() }),
      },
    },
  )

// Re-exported helper so test files can target the resolveAuthUser path mock.
export { resolveAuthUser }
