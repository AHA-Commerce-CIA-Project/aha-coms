import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { workspaceSyncLog } from '~/db/schema'
import { desc, sql } from 'drizzle-orm'
import { requireRole } from '../middleware/rbac'
import { runWorkspaceSync } from '../services/workspace-sync'
import { logAudit } from '../services/audit'

// Auth-guarded routes: trigger / status / history
export const workspaceSyncRoutes = new Elysia({ prefix: '/workspace-sync' })
  .use(requireRole('admin', 'super_admin'))

  // POST /workspace-sync/trigger — super_admin only
  .post('/trigger', async (ctx) => {
    const { authUser } = ctx as unknown as { authUser: { gipUid: string; portalRole: string } }

    if (authUser.portalRole !== 'super_admin') {
      return new Response(JSON.stringify({ message: 'Insufficient portal role' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    }

    const result = await runWorkspaceSync(`manual:${authUser.gipUid}`)

    await logAudit({
      actorId: authUser.gipUid,
      action: 'workspace_sync_triggered',
      targetType: 'workspace_sync',
      targetId: result.logId,
    })

    const auditAction = result.status === 'completed'
      ? 'workspace_sync_completed' as const
      : 'workspace_sync_failed' as const

    await logAudit({
      actorId: authUser.gipUid,
      action: auditAction,
      targetType: 'workspace_sync',
      targetId: result.logId,
    })

    return result
  })

  // GET /workspace-sync/status — admin or super_admin
  .get('/status', async () => {
    const rows = await db
      .select()
      .from(workspaceSyncLog)
      .orderBy(desc(workspaceSyncLog.startedAt))
      .limit(1)

    return rows[0] ?? null
  })

  // GET /workspace-sync/history — admin or super_admin
  .get(
    '/history',
    async ({ query }) => {
      const page = Math.max(1, parseInt(query.page ?? '1', 10))
      const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)))
      const offset = (page - 1) * limit

      const [rows, countResult] = await Promise.all([
        db
          .select()
          .from(workspaceSyncLog)
          .orderBy(desc(workspaceSyncLog.startedAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(workspaceSyncLog),
      ])

      return {
        data: rows,
        total: countResult[0]?.count ?? 0,
        page,
        limit,
      }
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
    },
  )

