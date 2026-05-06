import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { appRegistry, teamAppAccess, teams } from '~/db/schema'
import { eq } from 'drizzle-orm'
import { requireRole } from '../middleware/rbac'
import {
  AppIntegrationValidationError,
  AppManifestValidationError,
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
  serviceAccountEmail: t.Optional(t.String()),
  // Spec 03d D12 — admin can land an app_manifests row in the same call.
  // Empty configSchema (or omitting `manifest` entirely) skips the manifest
  // write; the app boots without managed config.
  manifest: t.Optional(
    t.Object({
      configSchema: t.Record(t.String(), t.Unknown()),
      schemaVersion: t.Optional(t.Integer({ minimum: 1 })),
      taxonomies: t.Optional(t.Array(t.String())),
    }),
  ),
})

export const appRoutes = new Elysia({ prefix: '/apps' })
  .use(requireRole('admin'))

  .get('/', async () => {
    return db.select().from(appRegistry)
  }, { response: { 200: t.Array(t.Any()) } })

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
  }, { response: { 200: t.Any(), 404: t.Object({ message: t.String() }) } })

  .post(
    '/',
    async ({ body, authUser, requestId, actorIp, set }) => {
      const { manifest, ...appBody } = body
      let result: { id: string }
      try {
        result = await registerApp({
          ...appBody,
          contractVersion: appBody.contractVersion ?? PLATFORM_AUTH_CONTRACT_VERSION,
          lastVerifiedAt: appBody.lastVerifiedAt ? new Date(appBody.lastVerifiedAt) : undefined,
          manifest,
        })
      } catch (error) {
        if (error instanceof AppIntegrationValidationError) {
          set.status = 400
          return { message: error.message, errors: error.errors }
        }
        if (error instanceof AppManifestValidationError) {
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
          slug: appBody.slug,
          adapterType: appBody.adapterType,
          transportMode: appBody.transportMode,
          complianceStatus: appBody.complianceStatus,
          manifestRegistered:
            manifest !== undefined &&
            Object.keys(manifest.configSchema ?? {}).length > 0,
        },
        requestId,
        actorIp,
        targetAppId: result.id,
      })
      return { id: result.id }
    },
    {
      body: appBody,
      response: {
        200: t.Object({ id: t.String() }),
        400: t.Object({ message: t.String(), errors: t.Any() }),
      },
    },
  )

  .patch(
    '/:id',
    async ({ params, body, authUser, requestId, actorIp, set }) => {
      // PATCH ignores the `manifest` payload today — manifest edits go through
      // a future dedicated endpoint when D12's admin form gains an "edit
      // manifest" flow. Strip it so the strongly-typed updateApp path remains
      // honest about which columns it touches.
      const { manifest: _ignoredManifest, ...patchBody } = body
      try {
        await updateApp(params.id, {
          ...patchBody,
          lastVerifiedAt: patchBody.lastVerifiedAt ? new Date(patchBody.lastVerifiedAt) : undefined,
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
        requestId,
        actorIp,
        targetAppId: params.id,
      })
      return { ok: true }
    },
    {
      body: t.Partial(appBody),
      response: {
        200: t.Object({ ok: t.Literal(true) }),
        400: t.Object({ message: t.String(), errors: t.Any() }),
      },
    },
  )

  .delete('/:id', async ({ params, authUser, requestId, actorIp, set }) => {
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
      requestId,
      actorIp,
      targetAppId: params.id,
    })
    return { ok: true }
  }, { response: { 200: t.Object({ ok: t.Literal(true) }), 404: t.Object({ message: t.String() }) } })
