import type { UserRole } from '@coms/shared/constants'
import type { AuthUser } from './auth'
import { AuthError } from './auth'

export function requireRole(...allowedRoles: readonly UserRole[]) {
  return ({ authUser }: { authUser: AuthUser }) => {
    if (!allowedRoles.includes(authUser.role)) {
      throw new AuthError(
        403,
        'FORBIDDEN',
        `Role '${authUser.role}' is not authorized for this action`,
      )
    }
  }
}
