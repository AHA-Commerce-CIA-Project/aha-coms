import { redirect } from '@sveltejs/kit'
import { SESSION_COOKIE_NAME } from '@coms-portal/shared'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ cookies, url, fetch }) => {
  const sessionCookie = cookies.get(SESSION_COOKIE_NAME)
  if (!sessionCookie) return {}

  try {
    const res = await fetch('/api/auth/me')
    if (!res.ok) return {}
  } catch {
    return {}
  }

  throw redirect(303, url.searchParams.get('redirect') ?? '/')
}
