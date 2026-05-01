import { Elysia } from 'elysia'
import { hasPortalRole, type PortalRole } from '@coms-portal/shared'
import { authPlugin } from './auth'
import { requestIdPlugin } from './request-id'

/**
 * Returns an Elysia plugin that enforces portal role access.
 * Must be used after authPlugin (which populates authUser).
 *
 * Usage:
 *   app.use(requireRole('admin'))
 */
export function requireRole(...roles: PortalRole[]) {
  return new Elysia({ name: `rbac-${roles.join('-')}` })
    .use(requestIdPlugin)
    .use(authPlugin)
    .derive({ as: 'scoped' }, async ({ authUser, status }) => {
      if (!authUser) {
        throw status(401, { message: 'Unauthorized' })
      }
      // super_admin is an internal concept; for RBAC purposes it has the highest
      // rank — treat as 'admin' when forwarding to hasPortalRole.
      const effectiveRole = (authUser.portalRole === 'super_admin' ? 'admin' : authUser.portalRole) as PortalRole
      if (!hasPortalRole(effectiveRole, roles)) {
        throw status(403, { message: 'Insufficient portal role' })
      }
      return { authUser }
    })
}

/**
 * Pure predicate for the super_admin capability gate.  Exposed for unit testing the
 * decision in isolation; the Elysia middleware below wraps this and throws.
 *
 * Returns:
 *   { ok: true }  — caller may proceed
 *   { ok: false, status, message } — caller must respond with the indicated status
 */
export function checkSuperAdmin(authUser: { portalRole?: string } | null | undefined):
  | { ok: true }
  | { ok: false; status: 401 | 403; message: string } {
  if (!authUser) return { ok: false, status: 401, message: 'Unauthorized' }
  if (authUser.portalRole !== 'super_admin') {
    return { ok: false, status: 403, message: 'Insufficient portal role' }
  }
  return { ok: true }
}

/**
 * Strict super_admin capability gate.  Bypasses the collapse-to-admin in `requireRole`
 * — only `portalRole === 'super_admin'` passes.  Used by spec-06 §11 (one-time login
 * link issuance) and any future portal-private capability that must not be reachable
 * by ordinary admins.
 *
 * super_admin remains internal: external surfaces (session JWT, webhooks, H-apps) still
 * see the role collapsed to 'admin'.  This middleware is the only place the distinction
 * is enforced at the route layer.
 */
export function requireSuperAdmin() {
  return new Elysia({ name: 'rbac-super-admin' })
    .use(requestIdPlugin)
    .use(authPlugin)
    .derive({ as: 'scoped' }, async ({ authUser, status }) => {
      const decision = checkSuperAdmin(authUser)
      if (!decision.ok) {
        throw status(decision.status, { message: decision.message })
      }
      return { authUser }
    })
}
