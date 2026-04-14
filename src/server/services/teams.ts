import { db } from '~/db'
import { teams, teamMembers, identityUsers } from '~/db/schema'
import { and, eq } from 'drizzle-orm'
import { resolveAndSyncClaims } from './claims'

export async function addTeamMember(teamId: string, userId: string): Promise<void> {
  await db.insert(teamMembers).values({ teamId, userId })

  const user = await db.query.identityUsers.findFirst({
    where: eq(identityUsers.id, userId),
  })

  if (user?.gipUid) {
    await resolveAndSyncClaims(user.gipUid, userId)
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
