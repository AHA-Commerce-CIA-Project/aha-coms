import { Elysia } from 'elysia'
import { db } from '~/db'
import { appRegistry } from '~/db/schema'
import { inArray } from 'drizzle-orm'
import { authPlugin } from '../middleware/auth'

export const dashboardRoutes = new Elysia({ prefix: '/dashboard' })
  .use(authPlugin)

  /**
   * GET /api/v1/dashboard
   * Returns apps the current user can access, based on the `apps` custom claim.
   */
  .get('/', async ({ authUser }) => {
    if (authUser.apps.length === 0) return []

    return db
      .select({
        id: appRegistry.id,
        slug: appRegistry.slug,
        name: appRegistry.name,
        description: appRegistry.description,
        url: appRegistry.url,
        iconUrl: appRegistry.iconUrl,
        status: appRegistry.status,
      })
      .from(appRegistry)
      .where(inArray(appRegistry.slug, authUser.apps))
  })
