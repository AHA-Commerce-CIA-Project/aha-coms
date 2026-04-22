import { db } from '~/db'
import { accessAuditLog } from '~/db/schema'

export type AuditAction =
  | 'create_employee'
  | 'import_employee_csv'
  | 'retry_employee_provisioning'
  | 'update_employee'
  | 'batch_update_employee'
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
  | 'personal_email_sync_triggered'
  | 'employee_info_sync_triggered'
  | 'create_webhook_endpoint'
  | 'rotate_webhook_secret'
  | 'delete_webhook_endpoint'

export type AuditTargetType = 'user' | 'team' | 'app' | 'personal_email_sync' | 'employee_info_sync'

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
