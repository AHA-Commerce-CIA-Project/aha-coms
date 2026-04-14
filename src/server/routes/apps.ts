import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { appRegistry } from '~/db/schema'
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
  .use(requireRole('super_admin'))

  .get('/', async () => {
    return db.select().from(appRegistry)
  })

  .post(
    '/',
    async ({ body, authUser }) => {
      const result = await registerApp(body)
      await logAudit({
        actorId: authUser.gipUid,
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
        actorId: authUser.gipUid,
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
      actorId: authUser.gipUid,
      action: 'deregister_app',
      targetType: 'app',
      targetId: params.id,
    })
    return { ok: true }
  })
