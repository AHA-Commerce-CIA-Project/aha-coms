import { Elysia } from 'elysia'
import { authRoutes } from './routes/auth'
import { employeeRoutes } from './routes/employees'
import { teamRoutes } from './routes/teams'
import { appRoutes } from './routes/apps'
import { accessRoutes } from './routes/access'
import { dashboardRoutes } from './routes/dashboard'
import { employeeInfoSyncRoutes } from './routes/employee-info-sync'
import { appWebhookRoutes } from './routes/app-webhooks'
import { authPlugin } from './middleware/auth'
import { initGip } from './gip'
import { startWebhookDeliveryWorker } from './services/webhook-delivery-worker'

initGip()

// Start the durable webhook retry worker. Skipped in test environments — tests
// start the worker explicitly with injected dependencies.
if (process.env.NODE_ENV !== 'test') {
  startWebhookDeliveryWorker()
}

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
      .use(employeeInfoSyncRoutes)
      .use(appWebhookRoutes),
  )

export type App = typeof app
