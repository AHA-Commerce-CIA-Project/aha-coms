import { Elysia } from 'elysia'
import { authRoutes } from './routes/auth'
import { employeeRoutes } from './routes/employees'
import { teamRoutes } from './routes/teams'
import { appRoutes } from './routes/apps'
import { accessRoutes } from './routes/access'
import { dashboardRoutes } from './routes/dashboard'
import { employeeInfoSyncRoutes } from './routes/employee-info-sync'
import { appWebhookRoutes } from './routes/app-webhooks'
import { internalRoutes } from './routes/internal'
import { authPlugin } from './middleware/auth'
import { initGip } from './gip'
import { startHealthProbeInterval } from './services/health-probe'
import { adminRoutes } from './routes/admin'

initGip()

// Background timers — webhook retry has moved to Cloud Tasks (see
// services/cloud-tasks-client.ts and routes/internal.ts). Health probing still
// runs in-process for the moment; spec-04 covers moving it to Cloud Scheduler.
if (process.env.NODE_ENV !== 'test') {
  startHealthProbeInterval()
}

export const app = new Elysia({ prefix: '/api' })
  .onError(({ error, path }) => {
    console.error(`[API Error] ${path}:`, error)
    return { message: error instanceof Error ? error.message : 'Internal error' }
  })
  .get('/health', () => ({ status: 'ok' }))
  .use(authRoutes)
  .use(internalRoutes)
  .group('/v1', (app) =>
    app
      .use(authPlugin)
      .use(employeeRoutes)
      .use(teamRoutes)
      .use(appRoutes)
      .use(accessRoutes)
      .use(dashboardRoutes)
      .use(employeeInfoSyncRoutes)
      .use(appWebhookRoutes)
      .use(adminRoutes),
  )

export type App = typeof app
