import { Elysia } from 'elysia'
import { authRoutes } from './routes/auth'
import { employeeRoutes } from './routes/employees'
import { teamRoutes } from './routes/teams'
import { appRoutes } from './routes/apps'
import { accessRoutes } from './routes/access'
import { dashboardRoutes } from './routes/dashboard'
import { personalEmailSyncRoutes } from './routes/personal-email-sync'
import { authPlugin } from './middleware/auth'
import { initGip } from './gip'

initGip()

export const app = new Elysia({ prefix: '/api' })
  .onError(({ error, path }) => {
    console.error(`[API Error] ${path}:`, error)
    return { message: error instanceof Error ? error.message : 'Internal error' }
  })
  .get('/health', () => ({ status: 'ok' }))
  .use(authRoutes)
  .group('/v1', (app) =>
    app
      .use(authPlugin)
      .use(employeeRoutes)
      .use(teamRoutes)
      .use(appRoutes)
      .use(accessRoutes)
      .use(dashboardRoutes)
      .use(personalEmailSyncRoutes),
  )

export type App = typeof app
