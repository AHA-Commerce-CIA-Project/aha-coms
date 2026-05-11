import { Elysia, t } from 'elysia'
import { db } from '~/db'
import { aliasCollisionQueue } from '~/db/schema/alias-collision-queue'
import { eq, asc } from 'drizzle-orm'
import { requireRole } from '~/middleware/rbac'
import { createAlias } from '~/services/aliases'
import { logAudit } from '~/services/audit'

export const aliasQueueRoutes = new Elysia({ prefix: '/alias-queue' })
  .use(requireRole('admin'))

  .get('/', async () => {
    const rows = await db
      .select()
      .from(aliasCollisionQueue)
      .where(eq(aliasCollisionQueue.status, 'pending'))
      .orderBy(asc(aliasCollisionQueue.rawNameNormalized), asc(aliasCollisionQueue.createdAt))

    const groupMap = new Map<string, typeof rows>()
    for (const row of rows) {
      const key = row.rawNameNormalized
      if (!groupMap.has(key)) groupMap.set(key, [])
      groupMap.get(key)!.push(row)
    }

    const groups = Array.from(groupMap.entries()).map(([rawNameNormalized, items]) => ({
      rawNameNormalized,
      count: items.length,
      oldestAt: items[0]!.createdAt.toISOString(),
      items: items.map((item) => ({
        id: item.id,
        rawName: item.rawName,
        rawNameNormalized: item.rawNameNormalized,
        suggestedIdentityUserId: item.suggestedIdentityUserId,
        source: item.source,
        context: item.context,
        createdAt: item.createdAt.toISOString(),
      })),
    }))

    return { groups }
  })

  .post(
    '/:id/resolve',
    async ({ params, body, authUser, requestId, actorIp, status }) => {
      const queueRow = await db.query.aliasCollisionQueue.findFirst({
        where: eq(aliasCollisionQueue.id, params.id),
      })

      if (!queueRow) throw status(404, { message: 'Queue item not found' })
      if (queueRow.status !== 'pending') throw status(409, { message: 'Queue item is not pending' })

      const newAlias = await createAlias({
        identityUserId: body.identityUserId,
        alias: queueRow.rawName,
        isPrimary: false,
        source: 'manual',
        actorId: authUser.id,
      })

      await db
        .update(aliasCollisionQueue)
        .set({
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy: authUser.id,
          resolutionAction: 'merge',
        })
        .where(eq(aliasCollisionQueue.id, params.id))

      await logAudit({
        actorId: authUser.id,
        action: 'alias_queue_resolve',
        targetType: 'alias_collision_queue',
        targetId: queueRow.id,
        details: {
          rawName: queueRow.rawName,
          identityUserId: body.identityUserId,
          action: 'merge',
        },
        requestId,
        actorIp,
      })

      return { aliasId: newAlias.id }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ identityUserId: t.String() }),
    },
  )

  .post(
    '/:id/reject',
    async ({ params, body, authUser, requestId, actorIp, status }) => {
      const queueRow = await db.query.aliasCollisionQueue.findFirst({
        where: eq(aliasCollisionQueue.id, params.id),
      })

      if (!queueRow) throw status(404, { message: 'Queue item not found' })
      if (queueRow.status !== 'pending') throw status(409, { message: 'Queue item is not pending' })

      const updatedContext = { ...(queueRow.context as Record<string, unknown>), rejectReason: body.reason }

      await db
        .update(aliasCollisionQueue)
        .set({
          status: 'rejected',
          resolvedAt: new Date(),
          resolvedBy: authUser.id,
          resolutionAction: 'reject',
          context: updatedContext,
        })
        .where(eq(aliasCollisionQueue.id, params.id))

      await logAudit({
        actorId: authUser.id,
        action: 'alias_queue_reject',
        targetType: 'alias_collision_queue',
        targetId: queueRow.id,
        details: {
          rawName: queueRow.rawName,
          reason: body.reason,
        },
        requestId,
        actorIp,
      })

      return { ok: true }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ reason: t.String() }),
    },
  )
