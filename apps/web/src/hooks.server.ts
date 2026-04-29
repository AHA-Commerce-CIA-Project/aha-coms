import type { Handle, HandleServerError } from '@sveltejs/kit'
import { SESSION_COOKIE_NAME } from '@coms-portal/shared'
import { validateSession } from '~/services/auth'
import { logger } from '~/lib/logger'

const AUTHED_PREFIX = '/(authed)'
const AUTH_TIMEOUT_MS = 3_000

function redirectToLogin(): Response {
  return new Response(null, {
    status: 303,
    headers: { location: '/login' },
  })
}

export const handle: Handle = async ({ event, resolve }) => {
  const isAuthedRoute = event.route.id?.startsWith(AUTHED_PREFIX)

  if (isAuthedRoute) {
    const sessionCookie = event.cookies.get(SESSION_COOKIE_NAME)
    if (!sessionCookie) {
      return redirectToLogin()
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
        return redirectToLogin()
      }

      event.locals.user = user
    } catch {
      return redirectToLogin()
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
