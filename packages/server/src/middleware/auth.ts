import Elysia from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '@coms/shared/db'
import { heroesProfiles, emailCache, userConfigCache } from '@coms/shared/db/schema'
import {
  getLocalSessionByToken,
  readSessionCookieFromHeaders,
} from '@coms/shared/auth/session'
import type { UserRole } from '@coms/shared/constants'

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

export const authPlugin = new Elysia({ name: 'auth' }).derive(
  { as: 'scoped' },
  async ({ request }) => {
    const token = readSessionCookieFromHeaders(request.headers)
    if (!token) {
      throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required')
    }

    const session = await getLocalSessionByToken(token)
    if (!session) {
      throw new AuthError(401, 'UNAUTHORIZED', 'Authentication required')
    }

    const [raw] = await db
      .select({
        id: heroesProfiles.id,
        name: heroesProfiles.name,
        branchKey: heroesProfiles.branchKey,
        branchValueSnapshot: heroesProfiles.branchValueSnapshot,
        teamKey: heroesProfiles.teamKey,
        teamValueSnapshot: heroesProfiles.teamValueSnapshot,
        role: heroesProfiles.role,
        email: emailCache.contactEmail,
        configJson: userConfigCache.config,
      })
      .from(heroesProfiles)
      .leftJoin(emailCache, eq(heroesProfiles.id, emailCache.portalSub))
      .leftJoin(userConfigCache, eq(heroesProfiles.id, userConfigCache.portalSub))
      .where(eq(heroesProfiles.id, session.userId))
      .limit(1)

    if (!raw) {
      throw new AuthError(
        403,
        'USER_NOT_FOUND',
        'No application user linked to this account',
      )
    }

    const cfg = raw.configJson as Record<string, unknown> | null

    const appUser: AuthUser = {
      id: raw.id,
      email: raw.email ?? '',
      name: raw.name,
      role: raw.role as UserRole,
      branchKey: raw.branchKey ?? null,
      branchValueSnapshot: raw.branchValueSnapshot ?? null,
      teamKey: raw.teamKey ?? null,
      teamValueSnapshot: raw.teamValueSnapshot ?? null,
      canSubmitPoints: (cfg?.canSubmitPoints as boolean | undefined) ?? false,
    }

    return { authUser: appUser }
  },
)

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
