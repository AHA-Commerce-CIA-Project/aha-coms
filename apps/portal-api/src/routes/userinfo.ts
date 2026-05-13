import { Elysia, t } from 'elysia'
import { inArray } from 'drizzle-orm'
import { db } from '~/db'
import { appRegistry } from '~/db/schema'
import { getSessionCookieValue } from '../middleware/session-cookie'
import { resolveAuthUser } from '../middleware/auth'
import { validateSession } from '../services/sessions'
import { getEmailEntriesWithIds } from '../services/email-resolution'

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

      // Build the launcher list by joining the user's resolved apps claim with
      // app_registry. Apps the user does not have access to are filtered out
      // server-side; the widget receives only what it can show.
      //
      // The synthetic `portal` entry is prepended unconditionally: portal is
      // the hub every authenticated user reaches, but it does not live in
      // `app_registry` (it IS the registry's owner). Consuming apps used to
      // hand-roll this prepend in their own layouts (heroes had it in two
      // places — ServiceBar catalog + AccountWidget appSwitcher). T47 lifts
      // that knowledge into the canonical source so future apps inherit it
      // without each one having to remember to special-case the hub.
      const launcherApps: Array<{ slug: string; label: string; url: string }> = [
        { slug: 'portal', label: 'COMS', url: '/' },
      ]
      if (authUser.apps.length > 0) {
        const rows = await db
          .select({
            slug: appRegistry.slug,
            name: appRegistry.name,
            url: appRegistry.url,
          })
          .from(appRegistry)
          .where(inArray(appRegistry.slug, authUser.apps))
        for (const r of rows) {
          launcherApps.push({ slug: r.slug, label: r.name, url: r.url })
        }
      }

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
