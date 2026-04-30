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
