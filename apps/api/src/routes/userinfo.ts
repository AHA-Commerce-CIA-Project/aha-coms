import { Elysia } from 'elysia'
import { eq, inArray } from 'drizzle-orm'
import { db } from '~/db'
import { identityUsers, appRegistry } from '~/db/schema'
import { verifySessionCookie } from '../gip-admin'
import { getSessionCookieValue } from '../middleware/session-cookie'
import { resolveAuthUser } from '../middleware/auth'

/**
 * GET /api/userinfo
 *
 * Account-widget data source. Returns the authenticated user's identity plus
 * the launcher list of apps they can reach. Authentication is the existing
 * portal session cookie; same auth path as `/api/auth/me`. Mounted at the API
 * root (not under `/api/auth/`) to match the OIDC userinfo convention and the
 * spec-01 §Widget API path.
 *
 * Response shape (spec-01 lines 105-132):
 *   {
 *     sub: string,        // identity_users.id
 *     name: string,       // display name
 *     email: string,
 *     role: string,       // portal role (employee | admin)
 *     avatar_url: null,   // identity_users has no avatar column today
 *     apps: [{ slug, label, url }]
 *   }
 *
 * The `apps` array joins the user's `apps` claim (resolved server-side from
 * team_app_access) with the registered app metadata so the host can hand a
 * complete launcher list to the widget without extra round-trips.
 */
export const userinfoRoutes = new Elysia()
  .get('/userinfo', async ({ request, set }) => {
    const cookieHeader = request.headers.get('cookie') ?? ''
    const sessionCookie = getSessionCookieValue(cookieHeader)
    if (!sessionCookie) {
      set.status = 401
      return { message: 'No session cookie' }
    }

    let decoded
    try {
      decoded = await verifySessionCookie(sessionCookie)
    } catch {
      set.status = 401
      return { message: 'Invalid or expired session' }
    }

    let authUser
    try {
      authUser = await resolveAuthUser(decoded)
    } catch {
      set.status = 401
      return { message: 'User not resolvable' }
    }

    // TODO(spec-03): when user_aliases ships (Rev 3 Spec 03 §Heroes follow-up F),
    // replace this read with: SELECT alias FROM user_aliases WHERE
    // identity_user_id = $1 AND is_primary = true LIMIT 1; on empty fall back to
    // ORDER BY created_at DESC LIMIT 1. Spec 01 owns the widget-side fix.
    const displayName = authUser.name

    // Build the launcher list by joining the user's resolved apps claim with
    // app_registry. Apps the user does not have access to are filtered out
    // server-side; the widget receives only what it can show.
    let launcherApps: Array<{ slug: string; label: string; url: string }> = []
    if (authUser.apps.length > 0) {
      const rows = await db
        .select({
          slug: appRegistry.slug,
          name: appRegistry.name,
          url: appRegistry.url,
        })
        .from(appRegistry)
        .where(inArray(appRegistry.slug, authUser.apps))
      launcherApps = rows.map((r) => ({ slug: r.slug, label: r.name, url: r.url }))
    }

    // identity_users has no avatar_url column today. Field is in the contract
    // for forward-compat with spec-04 (user preferences) which may add one.
    return {
      sub: authUser.id,
      name: displayName,
      email: authUser.email,
      role: authUser.portalRole,
      avatar_url: null as string | null,
      apps: launcherApps,
    }
  })

// Re-exported helper so test files can target the resolveAuthUser path mock.
export { resolveAuthUser, eq, identityUsers }
