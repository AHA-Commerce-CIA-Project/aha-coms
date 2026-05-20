import { Elysia } from 'elysia'
import { authPlugin } from '../middleware/auth'
import { getDashboardAppsForUser } from '../services/launcher'

export const dashboardRoutes = new Elysia({ prefix: '/dashboard' })
  .use(authPlugin)

  /**
   * GET /api/v1/dashboard
   * Returns apps the current user can access, based on the `apps` custom claim.
   * Logic lives in the launcher service so portal-web's SSR layout can call it
   * in-process — see apps/portal-api/src/services/launcher.ts.
   */
  .get('/', async ({ authUser }) => getDashboardAppsForUser(authUser))
