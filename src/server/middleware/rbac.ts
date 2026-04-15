import { Elysia } from 'elysia'
import type { PortalRole } from '~/shared/constants/roles'
import { authPlugin } from './auth'

/**
 * Returns an Elysia plugin that enforces portal role access.
 * Must be used after authPlugin (which populates authUser).
 *
 * Usage:
 *   app.use(requireRole('admin', 'super_admin'))
 */
export function requireRole(...roles: PortalRole[]) {
  return new Elysia({ name: `rbac-${roles.join('-')}` })
    .use(authPlugin)
    .derive({ as: 'scoped' }, async ({ authUser, status }) => {
      if (!authUser) {
        throw status(401, { message: 'Unauthorized' })
      }
      if (!roles.includes(authUser.portalRole)) {
        throw status(403, { message: 'Insufficient portal role' })
      }
      return { authUser }
    })
}
