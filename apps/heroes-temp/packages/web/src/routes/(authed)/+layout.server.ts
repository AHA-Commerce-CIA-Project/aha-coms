import { redirect } from '@sveltejs/kit'
import { env } from '$env/dynamic/public'
import { buildPortalSignInUrl } from '$lib/server/portal-broker'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    const absoluteDeepLink = `${env.PUBLIC_APP_ORIGIN}${url.pathname}${url.search}`
    redirect(302, buildPortalSignInUrl(absoluteDeepLink))
  }

  const actor = locals.user

  const { withRLS } = await import('@coms/server/repositories/base')
  const usersRepo = await import('@coms/server/repositories/users')
  const notificationsRepo = await import('@coms/server/repositories/notifications')

  const [avatarUrl, unreadCount] = await withRLS(actor, (db) =>
    Promise.all([
      usersRepo.getUserById(actor.id, db).then((u) => u?.avatarUrl ?? null),
      notificationsRepo.countUnread(actor.id, db),
    ]),
  )

  return {
    user: actor,
    avatarUrl,
    unreadCount,
    portalOrigin: env.PUBLIC_PORTAL_ORIGIN ?? '/',
    heroesOrigin: env.PUBLIC_APP_ORIGIN ?? '/',
  }
}
