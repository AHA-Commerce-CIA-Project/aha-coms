/**
 * requireFastAuth — server-side wrapper around loadFastAuthUser.
 *
 * Spec 05 Phase 3 / T61 — sub-phase (b).
 *
 * Reads the portal `__session` cookie via Next.js's `cookies()` helper,
 * resolves it through `loadFastAuthUser`, and returns the same
 * `{ user }` shape the 111 call sites used to read out of Better Auth's
 * `requireFastAuth()`. Returning the same shape means the T61 flip stays a
 * mechanical sed across imports + identifiers — every call site that
 * read `session.user.id` keeps reading `session.user.id`.
 *
 * Sub-phase (c) (T63) deletes `@/lib/auth-server` + `@/lib/auth-client`
 * + `@/lib/auth-context` + `@/lib/auth`; this helper survives that cut
 * because it lives under `@/lib/auth/` (subdirectory, retained).
 *
 * The PORTAL_ORIGIN env var fronts the single-origin host that serves
 * portal-api's `/api/userinfo` route — `https://aha-coms.web.app` in
 * prod, the operator's dev origin locally. Defaults to the prod host
 * so misconfigured environments fail loudly at the network edge
 * rather than silently returning null.
 */
import { cookies } from 'next/headers'
import { loadFastAuthUser, PortalSessionDeniedError, type AuthUser } from './load-fast-auth-user'

const DEFAULT_PORTAL_ORIGIN = 'https://aha-coms.web.app'

export type AppCatalogEntry = { slug: string; label: string; url: string }

export type FastSession = {
  user: AuthUser
  /** Cross-app launcher list from portal-api's /api/userinfo. Portal is prepended server-side
   *  by portal-api (T47 Finding 5) so callers iterate without special-casing. */
  appCatalog: readonly AppCatalogEntry[]
}

/**
 * Resolve the current fast session for a Server Component or Route
 * Handler. Returns null when:
 *   - no `__session` cookie is present
 *   - portal-api returned 401 (cookie expired / unknown)
 *   - the user is signed into portal but lacks the `fast` app claim
 *     (caught from PortalSessionDeniedError; surfaces as "no access"
 *     rather than "not signed in")
 *
 * Throws on transport / non-401 server errors so the caller's existing
 * try/catch posture stays meaningful.
 */
export async function requireFastAuth(): Promise<FastSession | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('__session')?.value
  if (!sessionCookie) return null

  const portalOrigin = process.env.PORTAL_ORIGIN || DEFAULT_PORTAL_ORIGIN

  try {
    const result = await loadFastAuthUser(sessionCookie, portalOrigin)
    if (!result) return null
    return { user: result.user, appCatalog: result.appCatalog }
  } catch (err) {
    if (err instanceof PortalSessionDeniedError) return null
    throw err
  }
}

export { PortalSessionDeniedError }
