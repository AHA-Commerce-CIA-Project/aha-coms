import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { appRegistry, teamAppAccess, teams } from '~/db/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '../middleware/rbac'
import {
  AppIntegrationValidationError,
  deregisterApp,
  registerApp,
  updateApp,
} from '../services/apps'
import { logAudit } from '../services/audit'
import { PLATFORM_AUTH_CONTRACT_VERSION } from '@coms-portal/shared/contracts/auth'

const appBody = t.Object({
  slug: t.String({ minLength: 1 }),
  name: t.String({ minLength: 1 }),
  description: t.Optional(t.String()),
  url: t.String(),
  basePath: t.String({ minLength: 1 }),
  iconUrl: t.Optional(t.String()),
  cloudRunService: t.Optional(t.String()),
  adapterType: t.Optional(
    t.Union([
      t.Literal('server_middleware'),
      t.Literal('edge_proxy'),
      t.Literal('gateway_bridge'),
      t.Literal('frontend_shell'),
    ]),
  ),
  transportMode: t.Optional(t.Union([t.Literal('same_host_cookie'), t.Literal('portable_token')])),
  handoffMode: t.Optional(
    t.Union([t.Literal('none'), t.Literal('one_time_code'), t.Literal('token_exchange')]),
  ),
  brokerOrigin: t.Optional(t.String()),
  contractVersion: t.Optional(t.Integer({ minimum: 1 })),
  complianceStatus: t.Optional(
    t.Union([
      t.Literal('draft'),
      t.Literal('planned'),
      t.Literal('dual_run'),
      t.Literal('compliant'),
      t.Literal('exception'),
      t.Literal('deprecated'),
    ]),
  ),
  manifestPath: t.Optional(t.String()),
  lastVerifiedAt: t.Optional(t.String({ format: 'date-time' })),
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
    async ({ body, authUser, set }) => {
      let result: { id: string }
      try {
        result = await registerApp({
          ...body,
          contractVersion: body.contractVersion ?? PLATFORM_AUTH_CONTRACT_VERSION,
          lastVerifiedAt: body.lastVerifiedAt ? new Date(body.lastVerifiedAt) : undefined,
        })
      } catch (error) {
        if (error instanceof AppIntegrationValidationError) {
          set.status = 400
          return { message: error.message, errors: error.errors }
        }
        throw error
      }
      await logAudit({
        actorId: authUser.id,
        action: 'register_app',
        targetType: 'app',
        targetId: result.id,
        details: {
          slug: body.slug,
          adapterType: body.adapterType,
          transportMode: body.transportMode,
          complianceStatus: body.complianceStatus,
        },
      })
      return { id: result.id }
    },
    { body: appBody },
  )

  .patch(
    '/:id',
    async ({ params, body, authUser, set }) => {
      try {
        await updateApp(params.id, {
          ...body,
          lastVerifiedAt: body.lastVerifiedAt ? new Date(body.lastVerifiedAt) : undefined,
        })
      } catch (error) {
        if (error instanceof AppIntegrationValidationError) {
          set.status = 400
          return { message: error.message, errors: error.errors }
        }
        throw error
      }
      await logAudit({
        actorId: authUser.id,
        action: 'update_app',
        targetType: 'app',
        targetId: params.id,
        details: {
          adapterType: body.adapterType,
          transportMode: body.transportMode,
          complianceStatus: body.complianceStatus,
        },
      })
      return { ok: true }
    },
    { body: t.Partial(appBody) },
  )

  .delete('/:id', async ({ params, authUser, set }) => {
    const app = await db.query.appRegistry.findFirst({
      where: eq(appRegistry.id, params.id),
    })
    if (!app) {
      set.status = 404
      return { message: 'Not found' }
    }
    await deregisterApp(params.id)
    await logAudit({
      actorId: authUser.id,
      action: 'deregister_app',
      targetType: 'app',
      targetId: params.id,
      details: { slug: app.slug, name: app.name },
    })
    return { ok: true }
  })
