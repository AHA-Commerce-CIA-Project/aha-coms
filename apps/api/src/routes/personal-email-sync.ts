import { Elysia } from 'elysia'
import { requireRole } from '../middleware/rbac'
import { syncPersonalEmails } from '../services/personal-email-sync'
import { logAudit } from '../services/audit'

export const personalEmailSyncRoutes = new Elysia({ prefix: '/personal-email-sync' })
  .use(requireRole('admin', 'super_admin'))

  // POST /personal-email-sync/trigger
  .post('/trigger', async (ctx) => {
    const { authUser } = ctx as unknown as { authUser: { id: string; gipUid: string } }

    const result = await syncPersonalEmails()

    await logAudit({
      actorId: authUser.id,
      action: 'personal_email_sync_triggered',
      targetType: 'personal_email_sync',
      targetId: 'sheet',
    })

    return result
  })
