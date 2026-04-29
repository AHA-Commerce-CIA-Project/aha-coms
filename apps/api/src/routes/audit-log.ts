import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { accessAuditLog } from '~/db/schema/audit'
import { requireBrokerToken } from '~/middleware/broker-token'
import { and, or, eq, gte, lte, lt, desc } from 'drizzle-orm'

const MAX_RANGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

interface CursorPayload {
  createdAt: string
  id: string
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'createdAt' in parsed &&
      'id' in parsed &&
      typeof (parsed as CursorPayload).createdAt === 'string' &&
      typeof (parsed as CursorPayload).id === 'string'
    ) {
      return parsed as CursorPayload
    }
    return null
  } catch {
    return null
  }
}

const entrySchema = t.Object({
  id: t.String(),
  occurredAt: t.String(),
  actorId: t.String(),
  action: t.String(),
  targetType: t.String(),
  targetId: t.String(),
  actorAppId: t.Union([t.String(), t.Null()]),
  targetAppId: t.Union([t.String(), t.Null()]),
  requestId: t.Union([t.String(), t.Null()]),
  details: t.Union([t.Unknown(), t.Null()]),
})

const responseSchema = t.Object({
  entries: t.Array(entrySchema),
  nextCursor: t.Union([t.String(), t.Null()]),
})

export const auditLogRoutes = new Elysia({ prefix: '/audit-log' })
  .use(requireBrokerToken())
  .get(
    '/',
    async ({ app, query, status }) => {
      const now = new Date()
      const defaultFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const minFrom = new Date(now.getTime() - MAX_RANGE_MS)

      let fromDate: Date
      let toDate: Date

      if (query.from) {
        fromDate = new Date(query.from)
        if (isNaN(fromDate.getTime())) {
          throw status(400, { error: 'invalid_param', reason: 'from must be a valid ISO date' })
        }
        if (fromDate < minFrom) fromDate = minFrom
      } else {
        fromDate = defaultFrom
      }

      if (query.to) {
        toDate = new Date(query.to)
        if (isNaN(toDate.getTime())) {
          throw status(400, { error: 'invalid_param', reason: 'to must be a valid ISO date' })
        }
      } else {
        toDate = now
      }

      const limit = Math.min(query.limit ?? 50, 100)
      const cursor = query.cursor ? decodeCursor(query.cursor) : null
      if (query.cursor && cursor === null) {
        throw status(400, { error: 'invalid_param', reason: 'invalid cursor' })
      }

      const tenantPredicate = or(
        eq(accessAuditLog.actorAppId, app.id),
        eq(accessAuditLog.targetAppId, app.id),
      )!

      const datePredicates = [
        gte(accessAuditLog.createdAt, fromDate),
        lte(accessAuditLog.createdAt, toDate),
      ]

      const cursorPredicate = cursor
        ? or(
            lt(accessAuditLog.createdAt, new Date(cursor.createdAt)),
            and(
              eq(accessAuditLog.createdAt, new Date(cursor.createdAt)),
              lt(accessAuditLog.id, cursor.id),
            ),
          )!
        : undefined

      const conditions = cursorPredicate
        ? and(tenantPredicate, ...datePredicates, cursorPredicate)!
        : and(tenantPredicate, ...datePredicates)!

      // Explicitly exclude actor_ip from the select — PII, never returned.
      const rows = await db
        .select({
          id: accessAuditLog.id,
          createdAt: accessAuditLog.createdAt,
          actorId: accessAuditLog.actorId,
          action: accessAuditLog.action,
          targetType: accessAuditLog.targetType,
          targetId: accessAuditLog.targetId,
          actorAppId: accessAuditLog.actorAppId,
          targetAppId: accessAuditLog.targetAppId,
          requestId: accessAuditLog.requestId,
          details: accessAuditLog.details,
        })
        .from(accessAuditLog)
        .where(conditions)
        .orderBy(desc(accessAuditLog.createdAt), desc(accessAuditLog.id))
        .limit(limit + 1)

      const hasMore = rows.length > limit
      const entries = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
        id: row.id,
        occurredAt: row.createdAt.toISOString(),
        actorId: row.actorId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        actorAppId: row.actorAppId ?? null,
        targetAppId: row.targetAppId ?? null,
        requestId: row.requestId ?? null,
        details: row.details ?? null,
      }))

      let nextCursor: string | null = null
      if (hasMore) {
        const last = entries[entries.length - 1]
        nextCursor = encodeCursor({ createdAt: last.occurredAt, id: last.id })
      }

      return { entries, nextCursor }
    },
    {
      query: t.Object({
        from: t.Optional(t.String({ description: 'ISO date, default = 24h ago, min = 30d ago' })),
        to: t.Optional(t.String({ description: 'ISO date, default = now' })),
        cursor: t.Optional(t.String({ description: 'Opaque base64url pagination cursor' })),
        limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 50 })),
      }),
      response: responseSchema,
      tags: ['audit'],
      detail: {
        summary: 'List audit log entries for the calling app',
        description:
          'Returns audit log rows where actor_app_id = caller OR target_app_id = caller. ' +
          'actor_ip is never included in the response.',
      },
    },
  )
