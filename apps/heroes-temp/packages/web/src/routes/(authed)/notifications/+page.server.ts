import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const actor = locals.user!
  const { withRLS } = await import('@coms/server/repositories/base')
  const notificationsRepo = await import('@coms/server/repositories/notifications')
  const { rows, total } = await withRLS(actor, (db) =>
    notificationsRepo.listNotifications({ userId: actor.id, page: 1, limit: 50 }, db),
  )
  return {
    notifications: {
      data: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      meta: { total, page: 1, limit: 50 },
    },
  }
}
