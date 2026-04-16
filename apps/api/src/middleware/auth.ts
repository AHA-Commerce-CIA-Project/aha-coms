import { Elysia } from 'elysia'
import { verifySessionCookie } from '../gip-admin'
import type { PortalClaims } from '@coms-portal/shared/constants/roles'
import { db } from '~/db'
import { identityUsers } from '~/db/schema'
import { eq } from 'drizzle-orm'
import { getSessionCookieValue } from './session-cookie'
import type { DecodedToken } from '../gip-admin'

export interface AuthUser {
  id: string
  gipUid: string
  email: string
  name: string
  portalRole: PortalClaims['portalRole']
  teamIds: string[]
  apps: string[]
}

export class AuthResolutionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 401 | 403,
  ) {
    super(message)
  }
}

export async function resolveAuthUser(decoded: DecodedToken): Promise<AuthUser> {
  const user = await db.query.identityUsers.findFirst({
    where: eq(identityUsers.gipUid, decoded.uid),
  })

  if (!user) {
    throw new AuthResolutionError('User not found', 401)
  }

  if (user.status !== 'active') {
    throw new AuthResolutionError('Account is inactive or suspended', 403)
  }

  return {
    id: user.id,
    gipUid: user.gipUid ?? decoded.uid,
    email: user.email,
    name: user.name,
    portalRole: user.portalRole as PortalClaims['portalRole'],
    teamIds: (decoded['teamIds'] as string[]) ?? [],
    apps: (decoded['apps'] as string[]) ?? [],
  }
}

/**
 * Elysia plugin that verifies the __session cookie on every request to /api/v1/*.
 * Injects `authUser` into the Elysia context.
 * Returns 401 if cookie is missing or invalid.
 */
export const authPlugin = new Elysia({ name: 'auth-plugin' }).derive(
  { as: 'scoped' },
  async ({ request, status }) => {
    const cookieHeader = request.headers.get('cookie') ?? ''
    const sessionCookie = getSessionCookieValue(cookieHeader)

    if (!sessionCookie) {
      throw status(401, { message: 'No session cookie' })
    }

    let decoded: DecodedToken
    try {
      decoded = await verifySessionCookie(sessionCookie)
    } catch {
      throw status(401, { message: 'Invalid or expired session' })
    }

    try {
      const authUser = await resolveAuthUser(decoded)
      return { authUser }
    } catch (error) {
      if (error instanceof AuthResolutionError) {
        throw status(error.statusCode, { message: error.message })
      }
      throw error
    }
  },
)
