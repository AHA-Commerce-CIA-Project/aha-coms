import type { Handle, HandleServerError } from '@sveltejs/kit'
import { base } from '$app/paths'
import { SESSION_COOKIE_NAME } from '@coms-portal/shared'
import { validateSession } from '@coms-portal/portal-api/services/auth'
import { logger } from '$lib/logger'

const AUTHED_PREFIX = '/(authed)'
const AUTH_TIMEOUT_MS = 3_000

// FU-10: portal-web mounts at /portal/ (svelte.config.js paths.base), so the
// login URL is /portal/login. The Response is constructed outside SvelteKit's
// routing helpers, so `$app/paths` `base` is interpolated explicitly. The
// caller's intended URL is forwarded via `?redirect=` so post-sign-in lands
// them where they tried to go.
function redirectToLogin(intendedUrl: URL): Response {
  const intended = intendedUrl.pathname + intendedUrl.search
  const target = `${base}/login?redirect=${encodeURIComponent(intended)}`
  return new Response(null, {
    status: 303,
    headers: { location: target },
  })
}

export const handle: Handle = async ({ event, resolve }) => {
  const isAuthedRoute = event.route.id?.startsWith(AUTHED_PREFIX)

  if (isAuthedRoute) {
    const sessionCookie = event.cookies.get(SESSION_COOKIE_NAME)
    if (!sessionCookie) {
      return redirectToLogin(event.url)
    }

    // Validate the session via a direct in-process function call (no loopback
    // HTTP). A timeout prevents a hung auth call from blocking SSR or producing
    // blank pages. Fail-closed: any error or timeout redirects to /login.
    try {
      const user = await Promise.race([
        validateSession(sessionCookie),
        new Promise<null>((_, reject) =>
          setTimeout(
            () => reject(new Error('Auth validation timed out')),
            AUTH_TIMEOUT_MS,
          ),
        ),
      ])

      if (!user) {
        return redirectToLogin(event.url)
      }

      event.locals.user = user
    } catch {
      return redirectToLogin(event.url)
    }
  }

  return resolve(event)
}

export const handleError: HandleServerError = ({ error, status, message, event }) => {
  const err = error as Error | undefined
  logger.error({
    status,
    message,
    route: event.route.id,
    url: event.url.pathname,
    name: err?.name,
    errorMessage: err?.message,
    stack: err?.stack,
  }, '[handleError]')
  return { message: 'Internal error' }
}
