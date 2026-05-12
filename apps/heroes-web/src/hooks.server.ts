import { sequence } from '@sveltejs/kit/hooks'
import type { Handle } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import { paraglideMiddleware } from '$lib/paraglide/server'
import { getTextDirection } from '$lib/paraglide/runtime'
import {
  loadHeroesAuthUser,
  PortalSessionDeniedError,
} from '@coms-portal/heroes-shared/auth/user'

// Spec 02 Phase 2 / T33 — heroes reads portal's `__session` cookie directly
// (the only cookie Firebase Hosting forwards to Cloud Run) and introspects
// it through portal-api's /api/userinfo. The legacy `coms_session` table
// and getLocalSessionByToken path are retired; T35/T36 will sweep the
// dead code and drop the underlying tables.
const PORTAL_SESSION_COOKIE = '__session'

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

  // PORTAL_ORIGIN points at the unified Firebase Hosting host (e.g.
  // https://aha-coms.web.app), so the userinfo fetch routes back through
  // Firebase's `/api/**` rewrite to coms-portal-api with the `__session`
  // cookie attached.
  const portalOrigin = env.PORTAL_ORIGIN
  if (!portalOrigin) {
    throw new Error('PORTAL_ORIGIN env var is required for session resolution')
  }

  try {
    event.locals.user = await loadHeroesAuthUser(token, portalOrigin)
  } catch (err) {
    if (err instanceof PortalSessionDeniedError) {
      // Authenticated portal user without heroes access — surface as a 403
      // upstream rather than bouncing back through portal sign-in.
      event.locals.user = null
    } else {
      throw err
    }
  }
  // Locals.session was a heroes-side handle on the local session row; with
  // portal-owned sessions there is nothing meaningful to surface here.
  // Phase 2 T35/T36 will drop the type entirely.
  event.locals.session = null

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
