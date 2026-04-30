import { validateSession as validatePortalSession } from './sessions'
import { resolveAuthUser, type AuthUser } from '../middleware/auth'

/**
 * Validate a portal session cookie and resolve the portal user.
 *
 * Composes `validateSession` (sessions.ts) + `resolveAuthUser` (middleware/auth.ts)
 * and presents a single, exception-free entry point for SSR auth gating in the web
 * app's `hooks.server.ts`.
 *
 * Returns the resolved user on success, or `null` on any failure — including
 * an invalid/expired/revoked cookie, a missing user record, an inactive account,
 * or any other thrown error. The caller (the SSR hook) is responsible for the redirect.
 */
export async function validateSession(
  sessionCookie: string,
): Promise<AuthUser | null> {
  try {
    const sessionUser = await validatePortalSession(sessionCookie)
    if (!sessionUser) return null
    return await resolveAuthUser(sessionUser)
  } catch {
    return null
  }
}
