import { db } from '~/db'
import { teams, teamMembers, teamAppAccess, memberAppRole } from '~/db/schema'
import { and, eq } from 'drizzle-orm'
import { emitUserUpdated } from './provisioning-events'
import { logger } from '~/logger'

export async function addTeamMember(teamId: string, userId: string, roleInTeam?: string): Promise<void> {
  await db.insert(teamMembers).values({ teamId, userId, ...(roleInTeam ? { roleInTeam } : {}) })

  // Fan out user.updated — team membership changed, which may change app access.
  // Claims are recomputed from DB per-request (resolveAuthUser); no GIP-side sync needed (Q-claims).
  emitUserUpdated(userId, ['teamIds', 'apps']).catch((err) => {
    logger.error({ err, userId }, '[provisioning-events] emitUserUpdated failed')
  })
}

export async function addTeamMembersBatch(
  teamId: string,
  members: Array<{ userId: string; roleInTeam?: string }>
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const member of members) {
      await tx
        .insert(teamMembers)
        .values({ teamId, userId: member.userId, ...(member.roleInTeam ? { roleInTeam: member.roleInTeam } : {}) })
        .onConflictDoNothing()
    }
  })

  for (const member of members) {
    emitUserUpdated(member.userId, ['teamIds', 'apps']).catch((err) => {
      logger.error({ err, userId: member.userId }, '[provisioning-events] emitUserUpdated failed')
    })
  }
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  // Find apps this team grants access to
  const teamApps = await db
    .select({ appId: teamAppAccess.appId })
    .from(teamAppAccess)
    .where(eq(teamAppAccess.teamId, teamId))

  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))

  // Clean up member app roles for apps the user no longer has access to
  if (teamApps.length > 0) {
    for (const { appId } of teamApps) {
      // Check if user still has access via another team
      const otherAccess = await db
        .select({ id: teamAppAccess.id })
        .from(teamAppAccess)
        .innerJoin(teamMembers, eq(teamMembers.teamId, teamAppAccess.teamId))
        .where(
          and(
            eq(teamMembers.userId, userId),
            eq(teamAppAccess.appId, appId),
          ),
        )

      if (otherAccess.length === 0) {
        await db
          .delete(memberAppRole)
          .where(and(eq(memberAppRole.userId, userId), eq(memberAppRole.appId, appId)))
      }
    }
  }

  // Fan out user.updated — team removed, app access may have narrowed.
  // Claims are recomputed from DB per-request (Q-claims); no GIP-side sync needed.
  emitUserUpdated(userId, ['teamIds', 'apps']).catch((err) => {
    logger.error({ err, userId }, '[provisioning-events] emitUserUpdated failed')
  })
}

export async function deleteTeam(teamId: string): Promise<void> {
  await db.delete(teams).where(eq(teams.id, teamId))
  // Member claims are recomputed from DB per-request post-Q-claims; no GIP-side sync to refresh.
  // user.updated webhook fanout would be desirable here for completeness, but the existing
  // implementation never emitted on team delete — preserve current behavior.
}
