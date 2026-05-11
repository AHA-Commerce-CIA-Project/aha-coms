import { Elysia, t } from 'elysia'
import { paginationQuery } from './_query'
import * as notificationsRepo from '../repositories/notifications'
import { withRLS } from '../repositories/base'
import type { AuthUser } from '../middleware/auth'

type Ctx = { authUser: AuthUser }

export const notificationsRoute = new Elysia({ prefix: '/notifications' })

  // GET /notifications — list own notifications
  .get('/', async ({ query, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx
    const { page, limit, unread } = query

    const { rows, total } = await withRLS(actor, (db) =>
      notificationsRepo.listNotifications(
        { userId: actor.id, page, limit, unread },
        db,
      ),
    )

    return {
      success: true,
      data: rows,
      error: null,
      meta: { total, page, limit },
    }
  }, { query: t.Object({
    ...paginationQuery,
    unread: t.Optional(t.BooleanString()),
  }) })

  // GET /notifications/unread-count — unread count for bell badge
  .get('/unread-count', async (c) => {
    const { authUser: actor } = c as unknown as Ctx

    const count = await withRLS(actor, (db) => notificationsRepo.countUnread(actor.id, db))

    return { success: true, data: { count }, error: null }
  })

  // PATCH /notifications/read-all — mark all unread as read
  .patch('/read-all', async (c) => {
    const { authUser: actor } = c as unknown as Ctx

    const updatedCount = await withRLS(actor, (db) => notificationsRepo.markAllRead(actor.id, db))

    return { success: true, data: { updatedCount }, error: null }
  })

  // PATCH /notifications/:id/read — mark single notification as read
  .patch('/:id/read', async ({ params, set, ...c }) => {
    const { authUser: actor } = c as unknown as Ctx

    const updated = await withRLS(actor, (db) => notificationsRepo.markRead(params.id, actor.id, db))

    if (!updated) {
      set.status = 404
      return { success: false, data: null, error: { code: 'NOT_FOUND', message: 'Notification not found' } }
    }

    return { success: true, data: updated, error: null }
  })
