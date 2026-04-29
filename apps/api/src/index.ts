import { Elysia } from 'elysia'
import cors from '@elysiajs/cors'
import swagger from '@elysiajs/swagger'
import { requestIdPlugin } from './middleware/request-id'
import { logger } from './logger'
import { probeHealth } from './services/health'
import { authRoutes } from './routes/auth'
import { userinfoRoutes } from './routes/userinfo'
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
import { CORS_ALLOWED_ORIGINS } from './config'
import { adminRoutes } from './routes/admin'
import { wellKnownRoutes } from './routes/well-known'
import { adminSigningKeyRoutes } from './routes/admin/signing-keys'
import { aliasQueueRoutes } from './routes/admin/alias-queue'
import { adminAppConfigRoutes } from './routes/admin/app-config'
import { aliasesRoutes } from './routes/aliases'
import { userRoutes } from './routes/users'
import { registerManifest } from './services/manifests'
import heroesManifest from './services/manifests/heroes.json'
import type { ManifestDefinition } from './services/manifests'

initGip()

// Background timers — webhook retry has moved to Cloud Tasks (see
// services/cloud-tasks-client.ts and routes/internal.ts). Health probing still
// runs in-process for the moment; spec-04 covers moving it to Cloud Scheduler.
if (process.env.NODE_ENV !== 'test') {
  startHealthProbeInterval()
  // Idempotent boot-time registration of all static app manifests.
  registerManifest(heroesManifest as ManifestDefinition).catch((err) => {
    logger.error({ err }, '[boot] manifest registration failed')
  })
}

export const app = new Elysia({ prefix: '/api' })
  .use(cors({
    origin: process.env.NODE_ENV === 'production'
      ? CORS_ALLOWED_ORIGINS
      : /http:\/\/localhost(:\d+)?$/,
    credentials: true,
    exposedHeaders: ['X-Coms-Request-Id'],
  }))
  // Elysia's validation errors and route-level handlers set their own status +
  // message before the request reaches onError. This handler is the catch-all
  // for unexpected exceptions (DB driver errors, dereference bugs, etc.). We
  // log the full error internally but never echo `error.message` to the
  // client — Drizzle / Postgres errors include the failing SQL + parameters,
  // which is an information-disclosure footgun on a public endpoint.
  .use(requestIdPlugin)
  .onError(({ error, code, path, set }) => {
    logger.error({ err: error, path }, '[API Error]')
    if (code === 'VALIDATION') {
      // Elysia's typebox validation errors are safe to surface — they describe
      // the request shape, not internal state.
      return { message: error instanceof Error ? error.message : 'Bad request' }
    }
    set.status = 500
    return { message: 'Internal error' }
  })
  .use(swagger({
    path: '/openapi.json',
    swaggerPath: '/docs',
    documentation: {
      info: {
        title: 'COMS Portal API',
        version: '0.1.0',
        contact: {
          name: 'COMS Portal',
          email: 'coms@ahacommerce.net',
        },
      },
      tags: [
        { name: 'auth' },
        { name: 'aliases' },
        { name: 'users' },
        { name: 'webhooks' },
        { name: 'apps' },
        { name: 'employees' },
        { name: 'access' },
        { name: 'admin' },
        { name: 'internal' },
      ],
    },
  }))
  .get('/health', async ({ set }) => {
    const result = await probeHealth()
    if (result.status === 'degraded') set.status = 503
    return result
  })
  // Public, unauthenticated — JWKS + OIDC discovery (Rev 2 §01 + §02)
  .use(wellKnownRoutes)
  .use(authRoutes)
  .use(userinfoRoutes)
  .use(internalRoutes)
  .use(aliasesRoutes)
  .use(userRoutes)
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
      .use(adminRoutes)
      // Signing-key rotation admin endpoint (Rev 2 §01). Mounted under /admin
      // by combining the adminRoutes prefix (/admin) implicitly via the group
      // path /admin/signing-keys.
      .group('/admin', (adminGroup) =>
        adminGroup.use(adminSigningKeyRoutes).use(aliasQueueRoutes).use(adminAppConfigRoutes),
      ),
  )

export type App = typeof app
