import { Elysia } from 'elysia'
import cors from '@elysiajs/cors'
import swagger from '@elysiajs/swagger'
import { requestIdPlugin } from './middleware/request-id'
import { handleApiError } from './middleware/api-error-handler'
import { probeHealth } from './services/health'
import { authRoutes } from './routes/auth'
import { oneTimeAuthRoutes } from './routes/auth/one-time'
import { meEmailRoutes } from './routes/me-emails'
import { meSessionRoutes } from './routes/me-sessions'
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
import { adminTaxonomiesRoutes } from './routes/admin/taxonomies'
import { adminEmployeesRoutes } from './routes/admin/employees'
import { aliasesRoutes } from './routes/aliases'
import { taxonomiesRoutes } from './routes/taxonomies'
import { userRoutes } from './routes/users'
import { auditLogRoutes } from './routes/audit-log'
import { appManifestRoutes } from './routes/app-manifest'

initGip()

// Background timers — webhook retry has moved to Cloud Tasks (see
// services/cloud-tasks-client.ts and routes/internal.ts). Health probing still
// runs in-process for the moment; spec-04 covers moving it to Cloud Scheduler.
//
// App manifests are no longer seeded from static files at boot (Spec 03d D12).
// Admins land app_registry + app_manifests rows together via the App Registry
// admin UI; existing rows persist across restarts.
if (process.env.NODE_ENV !== 'test') {
  startHealthProbeInterval()
}

export const app = new Elysia({ prefix: '/api' })
  .use(cors({
    origin: process.env.NODE_ENV === 'production'
      ? CORS_ALLOWED_ORIGINS
      : /http:\/\/localhost(:\d+)?$/,
    credentials: true,
    exposeHeaders: ['X-Coms-Request-Id'],
  }))
  // Elysia's validation errors and route-level handlers set their own status +
  // message before the request reaches onError. This handler is the catch-all
  // for unexpected exceptions (DB driver errors, dereference bugs, etc.). We
  // log the full error internally but never echo `error.message` to the
  // client — Drizzle / Postgres errors include the failing SQL + parameters,
  // which is an information-disclosure footgun on a public endpoint.
  .use(requestIdPlugin)
  .onError(handleApiError)
  .use(swagger({
    path: '/docs',
    specPath: '/openapi.json',
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
  .use(oneTimeAuthRoutes)
  .use(meEmailRoutes)
  .use(meSessionRoutes)
  .use(userinfoRoutes)
  .use(internalRoutes)
  .use(aliasesRoutes)
  .use(taxonomiesRoutes)
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
        adminGroup
          .use(adminSigningKeyRoutes)
          .use(aliasQueueRoutes)
          .use(adminAppConfigRoutes)
          .use(adminTaxonomiesRoutes)
          .use(adminEmployeesRoutes),
      ),
  )
  // Broker-token authenticated routes — separate /v1 group so session-cookie
  // authPlugin does not interfere with the broker bearer-token auth scheme.
  .group('/v1', (app) => app.use(auditLogRoutes))
  // App-token (Google OIDC) authenticated routes — same isolation rationale
  // as auditLogRoutes; appManifestRoutes uses requireAppToken, so it must
  // not sit behind authPlugin's session-cookie gate.
  .group('/v1', (app) => app.use(appManifestRoutes))

export type App = typeof app
