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

  const [{ db }, { heroesProfiles, emailCache, userConfigCache }, { eq }] = await Promise.all([
    import('@coms/shared/db'),
    import('@coms/shared/db/schema'),
    import('drizzle-orm'),
  ])

  const [raw] = await db
    .select({
      id: heroesProfiles.id,
      name: heroesProfiles.name,
      branchKey: heroesProfiles.branchKey,
      branchValueSnapshot: heroesProfiles.branchValueSnapshot,
      teamKey: heroesProfiles.teamKey,
      teamValueSnapshot: heroesProfiles.teamValueSnapshot,
      mustChangePassword: heroesProfiles.mustChangePassword,
      email: emailCache.contactEmail,
      configJson: userConfigCache.config,
    })
    .from(heroesProfiles)
    .leftJoin(emailCache, eq(heroesProfiles.id, emailCache.portalSub))
    .leftJoin(userConfigCache, eq(heroesProfiles.id, userConfigCache.portalSub))
    .where(eq(heroesProfiles.id, session.userId))
    .limit(1)

  if (raw) {
    const cfg = raw.configJson as Record<string, unknown> | null
    event.locals.user = {
      id: raw.id,
      email: raw.email ?? '',
      name: raw.name,
      role: (cfg?.role as AuthUser['role']) ?? 'employee',
      branchKey: raw.branchKey ?? null,
      branchValueSnapshot: raw.branchValueSnapshot ?? null,
      teamKey: raw.teamKey ?? null,
      teamValueSnapshot: raw.teamValueSnapshot ?? null,
      canSubmitPoints: (cfg?.canSubmitPoints as boolean | undefined) ?? false,
      mustChangePassword: raw.mustChangePassword,
      portalRole: session.portalRole,
      apps: session.apps,
    }
  } else {
    event.locals.user = null
  }
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
