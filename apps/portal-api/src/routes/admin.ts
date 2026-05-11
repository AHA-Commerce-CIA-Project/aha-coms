import { Elysia } from 'elysia'
import { db } from '~/db'
import { appRegistry } from '~/db/schema'
import { eq } from 'drizzle-orm'
import { authPlugin } from '../middleware/auth'
import { probeAllApps } from '~/services/health-probe'

export const adminRoutes = new Elysia({ prefix: '/admin' })
  .use(authPlugin)
  .post('/health-probe', async () => {
    await probeAllApps()
    return { status: 'ok' }
  })
  .get('/health-status', async () => {
    const apps = await db
      .select({
        id: appRegistry.id,
        slug: appRegistry.slug,
        name: appRegistry.name,
        healthStatus: appRegistry.healthStatus,
        lastHealthCheckAt: appRegistry.lastHealthCheckAt,
        lastHealthError: appRegistry.lastHealthError,
      })
      .from(appRegistry)
      .where(eq(appRegistry.status, 'active'))

    return apps
  })
