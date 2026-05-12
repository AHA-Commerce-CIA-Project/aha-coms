import { redirect } from '@sveltejs/kit'
import { base } from '$app/paths'
import { buildPortalSignInUrl } from '$lib/server/portal-broker'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
  // Spec 02 Phase 2 / T33 — when the portal `__session` cookie already
  // authenticated the request via hooks.server.ts, the legacy `portal_code`
  // exchange is dead weight: the cross-origin cookie dance the route was
  // built for no longer happens (single origin, Firebase forwards
  // `__session` automatically). Skip the exchange and land on the
  // dashboard. Phase 3 (T38/T39) decides whether to delete the route
  // entirely or keep it as a redirect-only handoff.
  if (url.searchParams.has('portal_code') && !locals.user) {
    redirect(302, `${base}/auth/portal/exchange${url.search}`)
  }
  redirect(302, locals.user ? `${base}/dashboard` : buildPortalSignInUrl())
}
