import { Elysia } from 'elysia'
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
import { adminRoutes } from './routes/admin'
import { wellKnownRoutes } from './routes/well-known'
import { adminSigningKeyRoutes } from './routes/admin/signing-keys'
import { aliasesRoutes } from './routes/aliases'
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
    console.error('[boot] manifest registration failed:', err)
  })
}

export const app = new Elysia({ prefix: '/api' })
  // Elysia's validation errors and route-level handlers set their own status +
  // message before the request reaches onError. This handler is the catch-all
  // for unexpected exceptions (DB driver errors, dereference bugs, etc.). We
  // log the full error internally but never echo `error.message` to the
  // client — Drizzle / Postgres errors include the failing SQL + parameters,
  // which is an information-disclosure footgun on a public endpoint.
  .onError(({ error, code, path, set }) => {
    console.error(`[API Error] ${path}:`, error)
    if (code === 'VALIDATION') {
      // Elysia's typebox validation errors are safe to surface — they describe
      // the request shape, not internal state.
      return { message: error instanceof Error ? error.message : 'Bad request' }
    }
    set.status = 500
    return { message: 'Internal error' }
  })
  .get('/health', () => ({ status: 'ok' }))
  // Public, unauthenticated — JWKS + OIDC discovery (Rev 2 §01 + §02)
  .use(wellKnownRoutes)
  .use(authRoutes)
  .use(userinfoRoutes)
  .use(internalRoutes)
  .use(aliasesRoutes)
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
      .group('/admin', (adminGroup) => adminGroup.use(adminSigningKeyRoutes)),
  )

export type App = typeof app
