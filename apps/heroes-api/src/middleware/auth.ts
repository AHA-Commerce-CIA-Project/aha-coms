import Elysia from 'elysia'
import {
  loadHeroesAuthUser,
  PortalSessionDeniedError,
} from '@coms-portal/heroes-shared/auth/user'
import type { UserRole } from '@coms-portal/heroes-shared/constants'

export type AuthUser = {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly role: UserRole
  readonly branchKey: string | null
  readonly branchValueSnapshot: string | null
  readonly teamKey: string | null
  readonly teamValueSnapshot: string | null
  readonly canSubmitPoints: boolean
}

const PORTAL_SESSION_COOKIE = '__session'

// Spec 02 Phase 2 / T34 — heroes-api reads portal's `__session` cookie
// (the only cookie Firebase Hosting forwards to Cloud Run) and introspects
// it through portal-api's /api/userinfo via `loadHeroesAuthUser`. Mirrors
// heroes-web's hooks.server.ts, intentionally — there should be exactly
// one session-resolution code path in the heroes tree.
export const authPlugin = new Elysia({ name: 'auth' }).derive(
  { as: 'scoped' },
  async ({ request }) => {
    const cookieHeader = request.headers.get('cookie') ?? ''
    const token = extractSessionCookie(cookieHeader)
    if (!token) {
      throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required')
    }

    const portalOrigin = process.env.PORTAL_ORIGIN
    if (!portalOrigin) {
      throw new Error('PORTAL_ORIGIN env var is required for session resolution')
    }

    let user
    try {
      const result = await loadHeroesAuthUser(token, portalOrigin)
      user = result?.user
    } catch (err) {
      if (err instanceof PortalSessionDeniedError) {
        throw new AuthError(
          403,
          'USER_NOT_FOUND',
          'No application user linked to this account',
        )
      }
      throw err
    }

    if (!user) {
      throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required')
    }

    const appUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      branchKey: user.branchKey,
      branchValueSnapshot: user.branchValueSnapshot,
      teamKey: user.teamKey,
      teamValueSnapshot: user.teamValueSnapshot,
      canSubmitPoints: user.canSubmitPoints,
    }

    return { authUser: appUser }
  },
)

function extractSessionCookie(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === PORTAL_SESSION_COOKIE) return rest.join('=') || null
  }
  return null
}

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}
