import { db } from '~/db'
import { accessAuditLog } from '~/db/schema'

export type AuditAction =
  | 'create_employee'
  | 'import_employee_csv'
  | 'retry_employee_provisioning'
  | 'update_employee'
  | 'batch_update_employee'
  | 'deactivate_employee'
  | 'upgrade_workspace'
  | 'create_team'
  | 'update_team'
  | 'delete_team'
  | 'add_team_member'
  | 'add_team_members_batch'
  | 'remove_team_member'
  | 'grant_app_access'
  | 'revoke_app_access'
  | 'set_member_app_role'
  | 'remove_member_app_role'
  | 'register_app'
  | 'update_app'
  | 'deregister_app'
  | 'personal_email_sync_triggered'
  | 'employee_info_sync_triggered'
  | 'create_webhook_endpoint'
  | 'rotate_webhook_secret'
  | 'delete_webhook_endpoint'
  | 'alias_queue_resolve'
  | 'alias_queue_reject'
  | 'update_app_user_config'
  | 'admin_add_email'
  | 'admin_edit_email'
  | 'admin_set_email_primary'
  | 'admin_remove_email'

export type AuditTargetType = 'user' | 'team' | 'app' | 'personal_email_sync' | 'employee_info_sync' | 'alias_collision_queue' | 'app_user_config'

export async function logAudit(params: {
  actorId: string
  action: AuditAction
  targetType: AuditTargetType
  targetId: string
  details?: Record<string, unknown>
  requestId?: string
  actorIp?: string
  actorAppId?: string
  targetAppId?: string
}): Promise<void> {
  await db.insert(accessAuditLog).values({
    actorId: params.actorId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    details: params.details ?? null,
    requestId: params.requestId ?? null,
    actorIp: params.actorIp ?? null,
    actorAppId: params.actorAppId ?? null,
    targetAppId: params.targetAppId ?? null,
  })
}
