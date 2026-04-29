import { Elysia } from 'elysia'
import { requireRole } from '../middleware/rbac'
import { syncEmployeeInfo } from '../services/employee-info-sync'
import { logAudit } from '../services/audit'

export const employeeInfoSyncRoutes = new Elysia({ prefix: '/employee-info-sync' })
  .use(requireRole('admin'))

  // POST /employee-info-sync/trigger
  .post('/trigger', async (ctx) => {
    const { authUser, requestId, actorIp } = ctx as unknown as { authUser: { id: string; gipUid: string }; requestId: string; actorIp: string | undefined }

    const result = await syncEmployeeInfo()

    await logAudit({
      actorId: authUser.id,
      action: 'employee_info_sync_triggered',
      targetType: 'employee_info_sync',
      targetId: 'sheet',
      requestId,
      actorIp,
    })

    return result
  })
