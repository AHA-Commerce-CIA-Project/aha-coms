import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { appRegistry, teamAppAccess, teams } from '~/db/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '../middleware/rbac'
import { registerApp, updateApp, deregisterApp } from '../services/apps'
import { logAudit } from '../services/audit'

const appBody = t.Object({
  slug: t.String({ minLength: 1 }),
  name: t.String({ minLength: 1 }),
  description: t.Optional(t.String()),
  url: t.String(),
  basePath: t.String({ minLength: 1 }),
  iconUrl: t.Optional(t.String()),
  cloudRunService: t.Optional(t.String()),
  status: t.Optional(
    t.Union([t.Literal('active'), t.Literal('maintenance'), t.Literal('deprecated')]),
  ),
})

export const appRoutes = new Elysia({ prefix: '/apps' })
  .use(requireRole('admin'))

  .get('/', async () => {
    return db.select().from(appRegistry)
  })

  .get('/:id', async ({ params, set }) => {
    const app = await db.query.appRegistry.findFirst({
      where: eq(appRegistry.id, params.id),
    })

    if (!app) {
      set.status = 404
      return { message: 'Not found' }
    }

    const teamGrants = await db
      .select({
        teamId: teamAppAccess.teamId,
        teamName: teams.name,
      })
      .from(teamAppAccess)
      .innerJoin(teams, eq(teams.id, teamAppAccess.teamId))
      .where(eq(teamAppAccess.appId, params.id))

    return { ...app, teamGrants }
  })

  .post(
    '/',
    async ({ body, authUser }) => {
      const result = await registerApp(body)
      await logAudit({
        actorId: authUser.id,
        action: 'register_app',
        targetType: 'app',
        targetId: result.id,
        details: { slug: body.slug },
      })
      return { id: result.id }
    },
    { body: appBody },
  )

  .patch(
    '/:id',
    async ({ params, body, authUser }) => {
      await updateApp(params.id, body)
      await logAudit({
        actorId: authUser.id,
        action: 'update_app',
        targetType: 'app',
        targetId: params.id,
      })
      return { ok: true }
    },
    { body: t.Partial(appBody) },
  )

  .delete('/:id', async ({ params, authUser }) => {
    await deregisterApp(params.id)
    await logAudit({
      actorId: authUser.id,
      action: 'deregister_app',
      targetType: 'app',
      targetId: params.id,
    })
    return { ok: true }
  })
