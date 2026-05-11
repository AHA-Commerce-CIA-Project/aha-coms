import { eq, and, gte, lte, count, desc } from 'drizzle-orm'
import { auditLogs, heroesProfiles, emailCache } from '@coms/shared/db/schema'
import type { DbClient } from './base'
import { getDb } from './base'
import type { ListAuditLogsInput } from '@coms/shared/schemas'

export type AuditLogRow = typeof auditLogs.$inferSelect & {
  actorName: string
  actorEmail: string | null
}

export async function listAuditLogs(
  input: ListAuditLogsInput,
  branchKey: string | null,
  tx?: DbClient,
): Promise<{ rows: AuditLogRow[]; total: number }> {
  const db = getDb(tx)
  const offset = (input.page - 1) * input.limit

  const conditions = []
  if (branchKey !== null) {
    conditions.push(eq(auditLogs.branchKey, branchKey))
  }
  if (input.action) {
    conditions.push(eq(auditLogs.action, input.action))
  }
  if (input.entityType) {
    conditions.push(eq(auditLogs.entityType, input.entityType))
  }
  if (input.actorId) {
    conditions.push(eq(auditLogs.actorId, input.actorId))
  }
  if (input.startDate) {
    conditions.push(gte(auditLogs.createdAt, new Date(input.startDate)))
  }
  if (input.endDate) {
    conditions.push(lte(auditLogs.createdAt, new Date(input.endDate)))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        branchKey: auditLogs.branchKey,
        actorId: auditLogs.actorId,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        oldValue: auditLogs.oldValue,
        newValue: auditLogs.newValue,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
        actorName: heroesProfiles.name,
        actorEmail: emailCache.contactEmail,
      })
      .from(auditLogs)
      .innerJoin(heroesProfiles, eq(auditLogs.actorId, heroesProfiles.id))
      .leftJoin(emailCache, eq(auditLogs.actorId, emailCache.portalSub))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(input.limit)
      .offset(offset),
    db.select({ total: count() }).from(auditLogs).where(where),
  ])

  return { rows, total }
}
