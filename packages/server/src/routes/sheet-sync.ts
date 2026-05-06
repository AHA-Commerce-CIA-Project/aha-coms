import { Elysia, t } from 'elysia'
import { paginationQuery } from './_query'
import {
  triggerSyncInBackground,
  triggerResyncInBackground,
  isSyncRunning,
  cleanupStaleJobs,
} from '../services/sheet-sync-scheduler'
import * as repo from '../repositories/sheet-sync'
import {
  getLocalSessionByToken,
  readSessionCookieFromHeaders,
} from '@coms/shared/auth/session'
import { db } from '@coms/shared/db'
import { heroesProfiles, emailCache } from '@coms/shared/db/schema'
import { eq } from 'drizzle-orm'
import type { UserRole } from '@coms/shared/constants'
import type { AuthUser } from '../middleware/auth'

type Ctx = { authUser: AuthUser }

// ── Public route: callable by Cloud Scheduler (OIDC) or admin (session) ─────
// Registered outside the auth group. Handles its own authentication.
export const sheetSyncTriggerRoute = new Elysia().post(
  '/sheet-sync-trigger',
  async ({ request, set }) => {
    // Path 1: Cloud Scheduler sends a Bearer OIDC token.
    // Cloud Run IAM validates the token before the request reaches the app.
    // If we got here with a Bearer token, the caller is authorized.
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const job = triggerSyncInBackground()
      return { success: true, data: job, error: null }
    }

    // Path 2: Admin user with a portal-issued local session cookie.
    const token = readSessionCookieFromHeaders(request.headers)
    const session = token ? await getLocalSessionByToken(token) : null
    if (!session) {
      set.status = 401
      return {
        success: false,
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }
    }

    const [appUser] = await db
      .select({
        id: heroesProfiles.id,
        role: heroesProfiles.role,
      })
      .from(heroesProfiles)
      .leftJoin(emailCache, eq(heroesProfiles.id, emailCache.portalSub))
      .where(eq(emailCache.contactEmail, session.email))
      .limit(1)

    const role = appUser?.role as UserRole | undefined

    if (!appUser || role !== 'admin') {
      set.status = 403
      return {
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      }
    }

    const job = triggerSyncInBackground(appUser.id)
    return { success: true, data: job, error: null }
  },
)

// ── Protected routes: admin-only (inside /v1 auth group) ────────────────────
export const sheetSyncRoute = new Elysia({ prefix: '/sheet-sync' })

  // POST /trigger — admin manual trigger (via session auth from UI)
  .post('/trigger', async ({ set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    if (actor.role !== 'admin') {
      set.status = 403
      return {
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      }
    }

    const job = triggerSyncInBackground(actor.id)
    return { success: true, data: job, error: null }
  })

  // POST /resync — wipe all transactional data then re-import from the sheet
  .post('/resync', async ({ set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    if (actor.role !== 'admin') {
      set.status = 403
      return {
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      }
    }

    const result = await triggerResyncInBackground(actor.id)
    return { success: true, data: result, error: null }
  })

  // GET /jobs — list sync job history
  .get(
    '/jobs',
    async ({ query, set, ...c }) => {
      const { authUser: actor } = c as unknown as Ctx

      if (actor.role !== 'admin') {
        set.status = 403
        return {
          success: false,
          data: null,
          error: { code: 'FORBIDDEN', message: 'Admin access required' },
        }
      }

      const result = await repo.listJobs({ page: query.page, limit: query.limit })
      return {
        success: true,
        data: result.jobs,
        error: null,
        meta: result.meta,
      }
    },
    { query: t.Object({ ...paginationQuery }) },
  )

  // GET /jobs/:id — get single job
  .get('/jobs/:id', async ({ params, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    if (actor.role !== 'admin') {
      set.status = 403
      return {
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      }
    }

    const job = await repo.getJobById(params.id)
    if (!job) {
      set.status = 404
      return {
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Sync job not found' },
      }
    }
    return { success: true, data: job, error: null }
  })

  // GET /status — current sync status
  .get('/status', async ({ set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    if (actor.role !== 'admin') {
      set.status = 403
      return {
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      }
    }

    // Clean up any stale jobs so the UI doesn't show "running" forever
    await cleanupStaleJobs()
    const isRunning = await isSyncRunning()
    const lastJob = await repo.getLatestJob()

    return {
      success: true,
      data: {
        isRunning,
        lastJob,
        schedule: 'manual',
      },
      error: null,
    }
  })
