import { redirect } from '@sveltejs/kit'
import { SESSION_COOKIE_NAME } from '@coms-portal/shared'
import { validateSession } from '~/services/auth'
import type { PageServerLoad } from './$types'

const AUTH_TIMEOUT_MS = 3_000

export const load: PageServerLoad = async ({ cookies, url }) => {
  const sessionCookie = cookies.get(SESSION_COOKIE_NAME)
  if (!sessionCookie) return {}

  try {
    const user = await Promise.race([
      validateSession(sessionCookie),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), AUTH_TIMEOUT_MS),
      ),
    ])
    if (!user) return {}
  } catch {
    return {}
  }

  const redirectTo = url.searchParams.get('redirect') ?? '/'
  throw redirect(303, redirectTo)
}
