import { Elysia } from 'elysia'
import { getAuth } from 'firebase-admin/auth'
import { initGip } from '../gip'
import type { PortalClaims } from '~/shared/constants/roles'

initGip()

export interface AuthUser {
  gipUid: string
  email: string
  name: string
  portalRole: PortalClaims['portalRole']
  teamIds: string[]
  apps: string[]
}

/**
 * Elysia plugin that verifies the __session cookie on every request to /api/v1/*.
 * Injects `authUser` into the Elysia context.
 * Returns 401 if cookie is missing or invalid.
 */
export const authPlugin = new Elysia({ name: 'auth-plugin' }).derive(
  { as: 'scoped' },
  async ({ request, error }) => {
    const cookieHeader = request.headers.get('cookie') ?? ''
    const match = cookieHeader.match(/__session=([^;]+)/)
    const sessionCookie = match?.[1]

    if (!sessionCookie) {
      throw error(401, { message: 'No session cookie' })
    }

    try {
      const decoded = await getAuth().verifySessionCookie(sessionCookie, true)

      const authUser: AuthUser = {
        gipUid: decoded.uid,
        email: decoded.email ?? '',
        name: decoded.name ?? decoded.email ?? '',
        portalRole: (decoded['portalRole'] as PortalClaims['portalRole']) ?? 'employee',
        teamIds: (decoded['teamIds'] as string[]) ?? [],
        apps: (decoded['apps'] as string[]) ?? [],
      }

      return { authUser }
    } catch {
      throw error(401, { message: 'Invalid or expired session' })
    }
  },
)
