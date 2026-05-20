import { db } from '~/db'
import { teams, teamMembers, teamAppAccess, memberAppRole } from '~/db/schema'
import { and, eq, sql } from 'drizzle-orm'
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
  if (members.length === 0) return
  // Single batched insert — one round-trip regardless of members.length (T1.4)
  await db
    .insert(teamMembers)
    .values(members.map((m) => ({
      teamId,
      userId: m.userId,
      ...(m.roleInTeam ? { roleInTeam: m.roleInTeam } : {}),
    })))
    .onConflictDoNothing()

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

  // Single DELETE: remove all member_app_role rows for this user across all affected apps,
  // but only where the user has no remaining access via another team (T1.3).
  // NOT EXISTS guard lives inside the statement — race-safe per Spec 07 §4.
  if (teamApps.length > 0) {
    const appIds = teamApps.map((a) => a.appId)
    // Build the IN list as individual sql params — avoids sql.join which is
    // unavailable in some drizzle-orm minor versions.
    const appIdParams = appIds.map((id) => sql`${id}::uuid`)
    const appIdList = appIdParams.reduce((acc, param, i) =>
      i === 0 ? param : sql`${acc}, ${param}`
    )
    await db.execute(sql`
      DELETE FROM member_app_role
      WHERE user_id = ${userId}::uuid
        AND app_id IN (${appIdList})
        AND NOT EXISTS (
          SELECT 1
          FROM team_app_access
          JOIN team_members ON team_members.team_id = team_app_access.team_id
          WHERE team_members.user_id = ${userId}::uuid
            AND team_app_access.app_id = member_app_role.app_id
        )
    `)
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
