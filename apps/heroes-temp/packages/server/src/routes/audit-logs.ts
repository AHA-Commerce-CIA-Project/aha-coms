import { Elysia, t } from 'elysia'
import { paginationQuery50 } from './_query'
import * as auditLogsService from '../services/audit-logs'
import type { AuthUser } from '../middleware/auth'

type Ctx = { authUser: AuthUser }

export const auditLogsRoute = new Elysia({ prefix: '/audit-logs' })

  // GET / — list audit logs (HR/Admin)
  .get('/', async ({ query, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    try {
      const result = await auditLogsService.listAuditLogs(query, { actor })
      return {
        success: true,
        data: result.logs,
        error: null,
        meta: result.meta,
      }
    } catch (err) {
      if (err instanceof auditLogsService.InsufficientRoleError) {
        set.status = 403
        return { success: false, data: null, error: { code: 'FORBIDDEN', message: err.message } }
      }
      throw err
    }
  }, { query: t.Object({
    ...paginationQuery50,
    action: t.Optional(t.String()),
    entityType: t.Optional(t.String()),
    actorId: t.Optional(t.String({ format: 'uuid' })),
    startDate: t.Optional(t.String()),
    endDate: t.Optional(t.String()),
  }) })
