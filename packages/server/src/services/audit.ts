import { auditLogs } from '@coms/shared/db/schema'
import type { DbClient } from '../repositories/base'
import { getDb } from '../repositories/base'
import type { AuditAction, AuditEntityType } from '@coms/shared/constants'
import type { AuthUser } from '../middleware/auth'

type AuditEntry = {
  readonly actor: AuthUser
  readonly action: AuditAction
  readonly entityType: AuditEntityType
  readonly entityId: string
  readonly oldValue?: unknown
  readonly newValue?: unknown
  readonly ipAddress?: string
}

/**
 * Writes an immutable audit log entry. Always snapshots actor info
 * (name, email, role) inside old_value/new_value so the log remains
 * self-contained if a user is later renamed or archived.
 */
export async function writeAuditLog(entry: AuditEntry, tx?: DbClient) {
  const db = getDb(tx)

  const actorSnapshot = {
    id: entry.actor.id,
    name: entry.actor.name,
    email: entry.actor.email,
    role: entry.actor.role,
  }

  const newValue = entry.newValue
    ? { ...((entry.newValue as Record<string, unknown>) ?? {}), _actor: actorSnapshot }
    : { _actor: actorSnapshot }

  await db.insert(auditLogs).values({
    branchId: entry.actor.branchKey,
    actorId: entry.actor.id,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    oldValue: entry.oldValue ?? null,
    newValue,
    ipAddress: entry.ipAddress ?? null,
  })
}
