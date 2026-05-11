import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { teams, teamMembers, teamAppAccess, appRegistry, memberAppRole } from '~/db/schema'
import { eq, sql, inArray } from 'drizzle-orm'
import { requireRole } from '../middleware/rbac'
import { addTeamMember, addTeamMembersBatch, removeTeamMember, deleteTeam } from '../services/teams'
import { logAudit } from '../services/audit'
import { getDisplayEmail } from '../services/email-resolution'

export const teamRoutes = new Elysia({ prefix: '/teams' })
  .use(requireRole('admin'))

  .get('/', async () => {
    return db
      .select({
        id: teams.id,
        name: teams.name,
        description: teams.description,
        memberCount: sql<number>`count(${teamMembers.id})`,
        createdAt: teams.createdAt,
      })
      .from(teams)
      .leftJoin(teamMembers, eq(teamMembers.teamId, teams.id))
      .groupBy(teams.id)
  })

  .post(
    '/',
    async ({ body, authUser, requestId, actorIp }) => {
      const [team] = await db.insert(teams).values(body).returning({ id: teams.id })
      await logAudit({
        actorId: authUser.id,
        action: 'create_team',
        targetType: 'team',
        targetId: team.id,
        requestId,
        actorIp,
      })
      return { id: team.id }
    },
    { body: t.Object({ name: t.String({ minLength: 1 }), description: t.Optional(t.String()) }) },
  )

  .get('/:id', async ({ params, set }) => {
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, params.id),
      with: { members: { with: { user: true } } },
    })
    if (!team) {
      set.status = 404
      return { message: 'Not found' }
    }
    const appAccess = await db
      .select({ id: teamAppAccess.id, appId: teamAppAccess.appId, name: appRegistry.name, slug: appRegistry.slug })
      .from(teamAppAccess)
      .innerJoin(appRegistry, eq(appRegistry.id, teamAppAccess.appId))
      .where(eq(teamAppAccess.teamId, params.id))

    // Fetch per-member app roles for all members of this team
    const memberIds = team.members.map((m) => m.userId)
    let memberRoles: Array<{ userId: string; appId: string; appRole: string }> = []
    if (memberIds.length > 0) {
      memberRoles = await db
        .select({
          userId: memberAppRole.userId,
          appId: memberAppRole.appId,
          appRole: memberAppRole.appRole,
        })
        .from(memberAppRole)
        .where(inArray(memberAppRole.userId, memberIds))
    }

    // Resolve display email per Q8a for each team member
    const memberEmailMap = new Map<string, string | null>()
    await Promise.all(
      team.members.map(async (member) => {
        const email = await getDisplayEmail(member.userId)
        memberEmailMap.set(member.userId, email)
      }),
    )

    return {
      ...team,
      members: team.members.map((member) => ({
        id: member.id,
        userId: member.userId,
        roleInTeam: member.roleInTeam,
        name: member.user?.name ?? null,
        email: memberEmailMap.get(member.userId) ?? null,
        appRoles: memberRoles
          .filter((r) => r.userId === member.userId)
          .map((r) => ({ appId: r.appId, appRole: r.appRole })),
      })),
      apps: appAccess,
    }
  })

  .patch(
    '/:id',
    async ({ params, body, authUser, requestId, actorIp }) => {
      await db
        .update(teams)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(teams.id, params.id))
      await logAudit({
        actorId: authUser.id,
        action: 'update_team',
        targetType: 'team',
        targetId: params.id,
        requestId,
        actorIp,
      })
      return { ok: true }
    },
    { body: t.Partial(t.Object({ name: t.String(), description: t.String() })) },
  )

  .delete('/:id', async ({ params, authUser, requestId, actorIp }) => {
    await deleteTeam(params.id)
    await logAudit({
      actorId: authUser.id,
      action: 'delete_team',
      targetType: 'team',
      targetId: params.id,
      requestId,
      actorIp,
    })
    return { ok: true }
  })

  .post(
    '/:id/members',
    async ({ params, body, authUser, requestId, actorIp }) => {
      await addTeamMember(params.id, body.userId, body.roleInTeam)
      await logAudit({
        actorId: authUser.id,
        action: 'add_team_member',
        targetType: 'team',
        targetId: params.id,
        details: { userId: body.userId },
        requestId,
        actorIp,
      })
      return { ok: true }
    },
    { body: t.Object({ userId: t.String(), roleInTeam: t.Optional(t.String()) }) },
  )

  .post(
    '/:id/members/batch',
    async ({ params, body, authUser, requestId, actorIp }) => {
      await addTeamMembersBatch(params.id, body.members)
      await logAudit({
        actorId: authUser.id,
        action: 'add_team_members_batch',
        targetType: 'team',
        targetId: params.id,
        details: { memberCount: body.members.length },
        requestId,
        actorIp,
      })
      return { ok: true }
    },
    {
      body: t.Object({
        members: t.Array(t.Object({ userId: t.String(), roleInTeam: t.Optional(t.String()) })),
      }),
    },
  )

  .delete('/:id/members/:userId', async ({ params, authUser, requestId, actorIp }) => {
    await removeTeamMember(params.id, params.userId)
    await logAudit({
      actorId: authUser.id,
      action: 'remove_team_member',
      targetType: 'team',
      targetId: params.id,
      details: { userId: params.userId },
      requestId,
      actorIp,
    })
    return { ok: true }
  })
