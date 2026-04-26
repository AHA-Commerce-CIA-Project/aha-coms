import { verifySessionCookie } from '../gip-admin'
import { resolveAuthUser, type AuthUser } from '../middleware/auth'

/**
 * Validate a Firebase session cookie and resolve the portal user.
 *
 * Composes existing primitives (`verifySessionCookie` + `resolveAuthUser`) and
 * presents a single, exception-free entry point for SSR auth gating in the web
 * app's `hooks.server.ts`.
 *
 * Returns the resolved user on success, or `null` on any failure — including
 * an invalid/expired cookie, a missing user record, an inactive account
 * (`AuthResolutionError`), or any other thrown error. The caller (the SSR
 * hook) is responsible for the redirect.
 */
export async function validateSession(
  sessionCookie: string,
): Promise<AuthUser | null> {
  try {
    const decoded = await verifySessionCookie(sessionCookie)
    return await resolveAuthUser(decoded)
  } catch {
    return null
  }
}
