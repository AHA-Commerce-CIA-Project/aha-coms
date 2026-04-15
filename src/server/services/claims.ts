import { setCustomUserClaims } from '../gip-admin'
import { db } from '~/db'
import { identityUsers, teamMembers, teamAppAccess, appRegistry } from '~/db/schema'
import { eq, inArray } from 'drizzle-orm'
import type { PortalClaims } from '~/shared/constants/roles'

/**
 * Resolve a user's current team memberships and accessible app slugs,
 * then push the updated custom claims to GIP.
 *
 * Note: existing session cookies carry old claims until the user re-authenticates
 * or the client calls getIdToken(true). Acceptable for a 250-user org.
 */
export async function resolveAndSyncClaims(gipUid: string, userId: string): Promise<void> {
  const user = await db.query.identityUsers.findFirst({
    where: eq(identityUsers.id, userId),
  })

  if (!user) return

  const memberships = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))

  const teamIds = memberships.map((m) => m.teamId)

  let appSlugs: string[] = []
  if (teamIds.length > 0) {
    const access = await db
      .select({ appId: teamAppAccess.appId })
      .from(teamAppAccess)
      .where(inArray(teamAppAccess.teamId, teamIds))

    const appIds = [...new Set(access.map((a) => a.appId))]

    if (appIds.length > 0) {
      const apps = await db
        .select({ slug: appRegistry.slug })
        .from(appRegistry)
        .where(inArray(appRegistry.id, appIds))

      appSlugs = apps.map((a) => a.slug)
    }
  }

  const claims: PortalClaims = {
    portalRole: user.portalRole as PortalClaims['portalRole'],
    teamIds,
    apps: appSlugs,
    claimsUpdatedAt: Date.now(),
  }

  await setCustomUserClaims(gipUid, claims)
}
