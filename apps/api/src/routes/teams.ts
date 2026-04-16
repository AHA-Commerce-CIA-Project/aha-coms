import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { teams, teamMembers, teamAppAccess, appRegistry } from '~/db/schema'
import { eq, sql } from 'drizzle-orm'
import { requireRole } from '../middleware/rbac'
import { addTeamMember, removeTeamMember, deleteTeam } from '../services/teams'
import { logAudit } from '../services/audit'

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
    async ({ body, authUser }) => {
      const [team] = await db.insert(teams).values(body).returning({ id: teams.id })
      await logAudit({
        actorId: authUser.id,
        action: 'create_team',
        targetType: 'team',
        targetId: team.id,
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

    return {
      ...team,
      members: team.members.map((member) => ({
        id: member.id,
        userId: member.userId,
        roleInTeam: member.roleInTeam,
        name: member.user?.name ?? null,
        email: member.user?.email ?? null,
      })),
      apps: appAccess,
    }
  })

  .patch(
    '/:id',
    async ({ params, body, authUser }) => {
      await db
        .update(teams)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(teams.id, params.id))
      await logAudit({
        actorId: authUser.id,
        action: 'update_team',
        targetType: 'team',
        targetId: params.id,
      })
      return { ok: true }
    },
    { body: t.Partial(t.Object({ name: t.String(), description: t.String() })) },
  )

  .delete('/:id', async ({ params, authUser }) => {
    await deleteTeam(params.id)
    await logAudit({
      actorId: authUser.id,
      action: 'delete_team',
      targetType: 'team',
      targetId: params.id,
    })
    return { ok: true }
  })

  .post(
    '/:id/members',
    async ({ params, body, authUser }) => {
      await addTeamMember(params.id, body.userId, body.roleInTeam)
      await logAudit({
        actorId: authUser.id,
        action: 'add_team_member',
        targetType: 'team',
        targetId: params.id,
        details: { userId: body.userId },
      })
      return { ok: true }
    },
    { body: t.Object({ userId: t.String(), roleInTeam: t.Optional(t.String()) }) },
  )

  .delete('/:id/members/:userId', async ({ params, authUser }) => {
    await removeTeamMember(params.id, params.userId)
    await logAudit({
      actorId: authUser.id,
      action: 'remove_team_member',
      targetType: 'team',
      targetId: params.id,
      details: { userId: params.userId },
    })
    return { ok: true }
  })
