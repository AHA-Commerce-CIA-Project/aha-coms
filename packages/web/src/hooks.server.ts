import { sequence } from '@sveltejs/kit/hooks'
import type { Handle } from '@sveltejs/kit'
import type { AuthUser } from '@coms/shared/types'
import { paraglideMiddleware } from '$lib/paraglide/server'
import { getTextDirection } from '$lib/paraglide/runtime'
import {
  PORTAL_SESSION_COOKIE,
  getLocalSessionByToken,
} from '@coms/shared/auth/session'

const i18n: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
    event.request = localizedRequest
    return resolve(event, {
      transformPageChunk: ({ html }) =>
        html.replace('%lang%', locale).replace('%dir%', getTextDirection(locale)),
    })
  })

const auth: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get(PORTAL_SESSION_COOKIE)
  if (!token) {
    event.locals.user = null
    event.locals.session = null
    return resolve(event)
  }

  const session = await getLocalSessionByToken(token)
  if (!session) {
    event.cookies.delete(PORTAL_SESSION_COOKIE, { path: '/' })
    event.locals.user = null
    event.locals.session = null
    return resolve(event)
  }

  const [{ db }, { users, userEmails }, { eq }] = await Promise.all([
    import('@coms/shared/db'),
    import('@coms/shared/db/schema'),
    import('drizzle-orm'),
  ])

  let [appUser] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      branchId: users.branchId,
      teamId: users.teamId,
      canSubmitPoints: users.canSubmitPoints,
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .where(eq(users.email, session.email))
    .limit(1)

  if (!appUser) {
    const [secondary] = await db
      .select({ userId: userEmails.userId })
      .from(userEmails)
      .where(eq(userEmails.email, session.email))
      .limit(1)

    if (secondary) {
      ;[appUser] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          branchId: users.branchId,
          teamId: users.teamId,
          canSubmitPoints: users.canSubmitPoints,
          mustChangePassword: users.mustChangePassword,
        })
        .from(users)
        .where(eq(users.id, secondary.userId))
        .limit(1)
    }
  }

  event.locals.user = appUser
    ? ({
        ...appUser,
        portalRole: session.portalRole,
        apps: session.apps,
      } as AuthUser)
    : null
  event.locals.session = {
    id: session.sessionId,
    userId: session.userId,
    expiresAt: session.expiresAt,
  }

  return resolve(event)
}

const theme: Handle = async ({ event, resolve }) => {
  const cookieValue = event.cookies.get('theme') ?? 'light'
  const resolvedClass = cookieValue === 'dark' ? 'dark' : 'light'
  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%theme-class%', resolvedClass),
  })
}

export const handle = sequence(i18n, auth, theme)
