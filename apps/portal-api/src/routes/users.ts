import { Elysia, t } from 'elysia'
import { eq, and } from 'drizzle-orm'
import { db } from '~/db'
import { appRegistry } from '~/db/schema/apps'
import { appUserConfig } from '~/db/schema/app-user-config'
import { requireAppToken } from '~/middleware/app-token'

export const userRoutes = new Elysia({ prefix: '/users' })
  .use(requireAppToken())
  .get(
    '/:portalSub/config/:appId',
    async ({ params, status, app }) => {
      // :appId is the app slug — reject if the caller is a different app
      if (app.slug !== params.appId) {
        throw status(403, { error: 'forbidden', reason: 'app_mismatch' })
      }

      // Resolve slug → registry UUID → config row in one join
      const [row] = await db
        .select({
          portalSub: appUserConfig.portalSub,
          appId: appRegistry.slug,
          config: appUserConfig.config,
          schemaVersion: appUserConfig.schemaVersion,
          updatedAt: appUserConfig.updatedAt,
        })
        .from(appUserConfig)
        .innerJoin(appRegistry, eq(appUserConfig.appId, appRegistry.id))
        .where(
          and(
            eq(appUserConfig.portalSub, params.portalSub),
            eq(appRegistry.slug, params.appId),
          ),
        )
        .limit(1)

      if (!row) {
        throw status(404, { error: 'not_found' })
      }

      return {
        portalSub: row.portalSub,
        appId: row.appId,
        config: row.config,
        schemaVersion: row.schemaVersion,
        updatedAt: row.updatedAt.toISOString(),
      }
    },
    {
      params: t.Object({ portalSub: t.String(), appId: t.String() }),
    },
  )
