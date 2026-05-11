import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { health } from './routes/health'
import { healthz } from './routes/healthz'
import { authPlugin } from './middleware/auth'
import { errorHandler } from './middleware/error-handler'
import { apiCacheControl } from './middleware/cache-control'
import { usersRoute } from './routes/users'
import { teamsRoute } from './routes/teams'
import { categoriesRoute } from './routes/categories'
import { pointsRoute } from './routes/points'
import { uploadsRoute } from './routes/uploads'
import { leaderboardRoute } from './routes/leaderboard'
import { notificationsRoute } from './routes/notifications'
import { dashboardRoute } from './routes/dashboard'
import { challengesRoute } from './routes/challenges'
import { appealsRoute } from './routes/appeals'
import { commentsRoute } from './routes/comments'
import { rewardsRoute } from './routes/rewards'
import { redemptionsRoute } from './routes/redemptions'
import { settingsRoute } from './routes/settings'
import { auditLogsRoute } from './routes/audit-logs'
import { reportsRoute } from './routes/reports'
import { sheetSyncRoute, sheetSyncTriggerRoute } from './routes/sheet-sync'
import { portalWebhooksRoute } from './routes/portal-webhooks'
import { adminPendingAliasesRoute } from './routes/admin-pending-aliases'
import { pullTaxonomiesOnBoot } from './services/portal-bootstrap'

const app = new Elysia()
  .onError(errorHandler)
  .use(
    cors({
      origin: true,
      credentials: true,
    }),
  )
  // API routes
  .group('/api', (api) =>
    api
      .use(apiCacheControl)
      .use(health)
      .use(healthz)
      .use(sheetSyncTriggerRoute)
      .use(portalWebhooksRoute)
      .use(adminPendingAliasesRoute)
      .group('/v1', (v1) =>
        v1
          .use(authPlugin)
          .use(usersRoute)
          .use(teamsRoute)
          .use(categoriesRoute)
          .use(pointsRoute)
          .use(uploadsRoute)
          .use(leaderboardRoute)
          .use(notificationsRoute)
          .use(dashboardRoute)
          .use(challengesRoute)
          .use(appealsRoute)
          .use(commentsRoute)
          .use(rewardsRoute)
          .use(redemptionsRoute)
          .use(settingsRoute)
          .use(auditLogsRoute)
          .use(reportsRoute)
          .use(sheetSyncRoute),
      ),
  )

// --- SvelteKit handler ---
const __dirname = dirname(fileURLToPath(import.meta.url))
const SVELTEKIT_BUILD_PATH = process.env.SVELTEKIT_BUILD_PATH
  ?? resolve(__dirname, '../../web/build')

if (process.env.NODE_ENV === 'production') {
  // In production, import the built SvelteKit handler (svelte-adapter-bun)
  try {
    const mod = await import(resolve(SVELTEKIT_BUILD_PATH, 'handler.js'))
    const { httpserver } = mod.default(mod.build_options.assets)

    // Serve SvelteKit static assets
    app.get('/immutable/*', async ({ request }) => {
      return httpserver(request)
    })

    // SvelteKit SSR handler — catch-all for non-API requests
    app.all('/*', async ({ request }) => {
      return httpserver(request)
    })
  } catch (e) {
    console.warn('[server] SvelteKit handler not found — running API-only mode', e)
  }
} else {
  // In dev, proxy to SvelteKit dev server
  app.all('/*', async ({ request }) => {
    try {
      const url = new URL(request.url)
      url.port = '5173'
      const proxyReq = new Request(url.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' })
      return fetch(proxyReq)
    } catch {
      return new Response('SvelteKit dev server not running', { status: 502 })
    }
  })
}

export type App = typeof app

const port = Number(process.env.PORT) || 8080

app.listen(port, () => {
  console.log(`[server] listening on :${port}`)
  void pullTaxonomiesOnBoot().catch((err) => {
    console.warn(`[server] taxonomy bootstrap encountered an unexpected error: ${(err as Error).message}`)
  })
})

export { app }
