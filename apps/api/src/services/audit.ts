import { db } from '~/db'
import { accessAuditLog } from '~/db/schema'

export type AuditAction =
  | 'create_employee'
  | 'update_employee'
  | 'deactivate_employee'
  | 'create_team'
  | 'update_team'
  | 'delete_team'
  | 'add_team_member'
  | 'remove_team_member'
  | 'grant_app_access'
  | 'revoke_app_access'
  | 'register_app'
  | 'update_app'
  | 'deregister_app'
  | 'workspace_sync_triggered'
  | 'workspace_sync_completed'
  | 'workspace_sync_failed'
  | 'personal_email_sync_triggered'

export type AuditTargetType = 'user' | 'team' | 'app' | 'workspace_sync' | 'personal_email_sync'

export async function logAudit(params: {
  actorId: string
  action: AuditAction
  targetType: AuditTargetType
  targetId: string
  details?: Record<string, unknown>
}): Promise<void> {
  await db.insert(accessAuditLog).values({
    actorId: params.actorId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    details: params.details ?? null,
  })
}
