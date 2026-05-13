import { redirect } from '@sveltejs/kit'
import { base } from '$app/paths'
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

  // FU-10: default landing is `${base}/dashboard` (= /portal/dashboard). An
  // explicit `?redirect=` query is honoured verbatim — heroes/fast pass
  // `/portal?app=heroes&redirect_to=…` here when bouncing through portal
  // sign-in for a sub-app launch; that `/portal` lands on the +page.server
  // redirect that forwards to /portal/dashboard with the query string intact,
  // and the layout's onMount picks up the handoff intent.
  throw redirect(303, url.searchParams.get('redirect') ?? `${base}/dashboard`)
}
