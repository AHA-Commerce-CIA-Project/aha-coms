import { db } from '~/db'
import { teams, teamMembers, identityUsers } from '~/db/schema'
import { and, eq } from 'drizzle-orm'
import { resolveAndSyncClaims } from './claims'
import { emitUserUpdated } from './provisioning-events'

export async function addTeamMember(teamId: string, userId: string, roleInTeam?: string): Promise<void> {
  await db.insert(teamMembers).values({ teamId, userId, ...(roleInTeam ? { roleInTeam } : {}) })

  const user = await db.query.identityUsers.findFirst({
    where: eq(identityUsers.id, userId),
  })

  if (user?.gipUid) {
    await resolveAndSyncClaims(user.gipUid, userId)
  }

  // Fan out user.updated — team membership changed, which may change app access
  emitUserUpdated(userId, ['teamIds', 'apps']).catch((err) => {
    console.error(`[provisioning-events] emitUserUpdated failed for ${userId}:`, err)
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
    const user = await db.query.identityUsers.findFirst({
      where: eq(identityUsers.id, member.userId),
    })

    if (user?.gipUid) {
      await resolveAndSyncClaims(user.gipUid, member.userId)
    }

    emitUserUpdated(member.userId, ['teamIds', 'apps']).catch((err) => {
      console.error(`[provisioning-events] emitUserUpdated failed for ${member.userId}:`, err)
    })
  }
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))

  const user = await db.query.identityUsers.findFirst({
    where: eq(identityUsers.id, userId),
  })

  if (user?.gipUid) {
    await resolveAndSyncClaims(user.gipUid, userId)
  }

  // Fan out user.updated — team removed, app access may have narrowed
  emitUserUpdated(userId, ['teamIds', 'apps']).catch((err) => {
    console.error(`[provisioning-events] emitUserUpdated failed for ${userId}:`, err)
  })
}

export async function deleteTeam(teamId: string): Promise<void> {
  // Fetch members before cascade delete so we can refresh their claims
  const members = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId))

  await db.delete(teams).where(eq(teams.id, teamId))

  for (const { userId } of members) {
    const user = await db.query.identityUsers.findFirst({
      where: eq(identityUsers.id, userId),
    })
    if (user?.gipUid) {
      await resolveAndSyncClaims(user.gipUid, userId)
    }
  }
}
